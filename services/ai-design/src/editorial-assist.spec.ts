import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfessionalTemplate, editorialField, editorialTarget } from '@invitaflow/design-document';
import { AiDesignService } from './ai-design.service.js';
import { SelfHostedEditorialProvider } from './editorial-provider.js';

const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const designId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const jobId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sourceText = 'Bienvenue à notre célébration chaleureuse et mémorable. '.repeat(40);
const layer = editorialField(createProfessionalTemplate('typographic-luxury'), 'invitation');
function fixture(overflow = true, text = sourceText, proposals = 0) {
  let job: Record<string, unknown> | null = null;
  const events: Record<string, unknown>[] = [];
  const tx = {
    $queryRaw: async () => [],
    aiDesignJob: {
      count: async ({ where }: { where: Record<string, unknown> }) => 'baseVersion' in where ? proposals : 0,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        job = { ...data, id: jobId, status: 'QUEUED', attempt: 0, summary: null, proposal: null, provider: null, errorCode: null, createdAt: new Date(), updatedAt: new Date(), startedAt: null, completedAt: null, previewObjectKey: null }; return job;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const expected = where['status'];
        const matches = expected && typeof expected === 'object' && 'in' in expected ? (expected.in as string[]).includes(String(job?.['status'])) : job?.['status'] === expected;
        if (!job || !matches) return { count: 0 };
        Object.assign(job, data); return { count: 1 };
      },
      findFirstOrThrow: async () => job,
      findUnique: async () => job,
      findFirst: async ({ where }: { where: Record<string, unknown> }) => where['ownerSubject'] === 'owner-a' ? job : null,
    },
    outboxMessage: { create: async ({ data }: { data: Record<string, unknown> }) => { events.push(data); return data; } },
  };
  let version = 1;
  const designs = {
    get: async () => ({ version, document: {} }),
    editorial: async () => ({ sourceVersion: version, fields: [{ elementId: 'invitation', sourceText: text, protectedTerms: [], target: { ...editorialTarget(layer, text), overflow }, layer }] }),
  };
  const prisma = { ...tx, $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) };
  const service = new AiDesignService(prisma as never, designs as never, {} as never, {} as never);
  return { service, events, current: () => job as unknown as { status: string; sourceDocument: { workflow: string; sourceText: string }; proposal: { fits: boolean; usage: { total_tokens: number } } } | null, stale: () => { version++; } };
}

test('editorial job is isolated, asynchronous, not applied automatically, and becomes stale', async () => {
  const prior = process.env['AI_PROVIDER']; process.env['AI_PROVIDER'] = 'mock';
  try {
    const value = fixture();
    const created = await value.service.create(eventId, designId, 'owner-a', 'Bearer test', { workflow: 'EDITORIAL_COMPRESSION', elementId: 'invitation', sourceVersion: 1, language: 'fr', compressionLevel: 'BALANCED' });
    assert.equal(created.status, 'QUEUED');
    assert.equal(created.editorial, null);
    assert.equal(value.current()?.['sourceDocument'].workflow, 'EDITORIAL_COMPRESSION');
    assert.equal(value.current()?.['sourceDocument'].sourceText, sourceText);
    assert.ok(!('elements' in value.current()!['sourceDocument']));
    assert.equal(value.events.length, 1);
    await value.service.cancel(eventId, designId, jobId, 'owner-a', 'Bearer test');
    assert.equal(value.current()?.['status'], 'CANCELLED');
    assert.equal(value.current()?.['sourceDocument'].sourceText, sourceText);
    value.stale();
    assert.equal((await value.service.get(eventId, designId, jobId, 'owner-a', 'Bearer test')).status, 'STALE');
    (value.current() as unknown as Record<string, unknown>)['createdAt'] = new Date(Date.now() - 7200000);
    assert.equal((await value.service.get(eventId, designId, jobId, 'owner-a', 'Bearer test')).status, 'EXPIRED');
    await assert.rejects(fixture(true, sourceText, 3).service.create(eventId, designId, 'owner-a', 'Bearer test', { workflow: 'EDITORIAL_COMPRESSION', elementId: 'invitation', sourceVersion: 1, language: 'fr', compressionLevel: 'BALANCED' }), error => !!error && typeof error === 'object' && 'getStatus' in error && typeof error.getStatus === 'function' && error.getStatus() === 429);
    await assert.rejects(value.service.get(eventId, designId, jobId, 'owner-b', 'Bearer test'));
    await assert.rejects(fixture(false).service.create(eventId, designId, 'owner-a', 'Bearer test', { workflow: 'EDITORIAL_COMPRESSION', elementId: 'invitation', sourceVersion: 1, language: 'fr', compressionLevel: 'BALANCED' }));
  } finally { if (prior === undefined) delete process.env['AI_PROVIDER']; else process.env['AI_PROVIDER'] = prior; }
});

test('editorial processing sends only its text contract, records proposal and usage, never images', async () => {
  const saved = { fetch: globalThis.fetch, provider: process.env['AI_PROVIDER'], url: process.env['AI_PROVIDER_URL'], model: process.env['AI_PROVIDER_MODEL'] };
  process.env['AI_PROVIDER'] = 'self-hosted'; process.env['AI_PROVIDER_URL'] = 'http://provider.test/completions'; process.env['AI_PROVIDER_MODEL'] = 'test-model';
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    const sent = JSON.parse(body.messages[1].content);
    assert.deepEqual(Object.keys(sent).sort(), ['text', 'language', 'tone', 'compressionLevel', 'targetLength', 'maxEstimatedLines', 'targetReductionRatio'].sort());
    assert.equal('document' in sent, false);
    assert.equal(sent.text.includes('Camille'), false);
    const token = sent.text.match(/__IF_PROTECTED_\d+__/u)?.[0];
    return Response.json({ choices: [{ message: { content: JSON.stringify({ text: token ? `Bienvenue à ${token} pour notre célébration.` : 'Bienvenue à notre célébration.', language: 'fr' }) } }], usage: { total_tokens: 50 } });
  };
  try {
    const privateSource = `Camille ${sourceText}`;
    const value = fixture(true, privateSource);
    await value.service.create(eventId, designId, 'owner-a', 'Bearer test', { workflow: 'EDITORIAL_COMPRESSION', elementId: 'invitation', sourceVersion: 1, language: 'fr', compressionLevel: 'CONCISE', protectedTerms: ['Camille'] });
    await value.service.process(jobId);
    assert.equal(calls, 1);
    assert.equal(value.current()?.['status'], 'PROPOSED');
    assert.equal(value.current()?.['proposal'].fits, true);
    assert.equal(value.current()?.['sourceDocument'].sourceText, privateSource);
    assert.equal(value.current()?.['proposal'].usage.total_tokens, 50);
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [key, value] of [['AI_PROVIDER', saved.provider], ['AI_PROVIDER_URL', saved.url], ['AI_PROVIDER_MODEL', saved.model]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('provider failures, timeout, unsupported language, empty and wrong-language responses are controlled', async () => {
  const savedFetch = globalThis.fetch;
  const saved = { ...process.env };
  process.env['AI_PROVIDER'] = 'self-hosted'; process.env['AI_PROVIDER_URL'] = 'http://provider.test/completions'; process.env['AI_PROVIDER_MODEL'] = 'test-model'; process.env['AI_EDITORIAL_LANGUAGES'] = 'fr,en';
  const input = { text: sourceText, language: 'fr', tone: 'preserve', compressionLevel: 'LIGHT', targetLength: 200, maxEstimatedLines: 7, targetReductionRatio: 0.15 };
  try {
    await assert.rejects(new SelfHostedEditorialProvider().compress({ ...input, language: 'ln' }), /unsupported_language/);
    globalThis.fetch = async () => { throw new DOMException('Timed out', 'TimeoutError'); };
    await assert.rejects(new SelfHostedEditorialProvider().compress(input), /provider_timeout/);
    globalThis.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(new SelfHostedEditorialProvider().compress(input), /provider_unavailable/);
    globalThis.fetch = async () => new Response('', { status: 429 });
    await assert.rejects(new SelfHostedEditorialProvider().compress(input), /provider_rate_limit/);
    globalThis.fetch = async () => new Response('{broken json', { status: 200 });
    await assert.rejects(new SelfHostedEditorialProvider().compress(input), /invalid_proposal/);
    globalThis.fetch = async () => Response.json({ choices: [] });
    await assert.rejects(new SelfHostedEditorialProvider().compress(input), /empty_response/);
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"text":"Welcome","language":"en"}' } }] });
    await assert.rejects(new SelfHostedEditorialProvider().compress(input), /wrong_language/);
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"text":"Welcome to our celebration","language":"fr"}' } }] });
    await assert.rejects(new SelfHostedEditorialProvider().compress(input), /wrong_language/);
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of ['AI_PROVIDER', 'AI_PROVIDER_URL', 'AI_PROVIDER_MODEL', 'AI_EDITORIAL_LANGUAGES']) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
});

test('failed or insufficient editorial proposals retain original and cannot be silently applied', async () => {
  const savedFetch = globalThis.fetch; const saved = { ...process.env };
  process.env['AI_PROVIDER'] = 'self-hosted'; process.env['AI_PROVIDER_URL'] = 'http://provider.test/completions'; process.env['AI_PROVIDER_MODEL'] = 'test-model';
  try {
    for (const mode of ['timeout', 'unavailable', 'empty', 'not_shorter', 'protected', 'still_long']) {
      const text = mode === 'protected' ? 'Rendez-vous à 14:30. ' + sourceText : sourceText;
      globalThis.fetch = async () => {
        if (mode === 'timeout') throw new DOMException('Timeout', 'TimeoutError');
        if (mode === 'unavailable') return new Response('', { status: 503 });
        const proposed = mode === 'empty' ? '' : mode === 'not_shorter' ? text : mode === 'still_long' ? text.slice(0, Math.floor(text.length * 0.6)) : 'Bienvenue à notre célébration.';
        return Response.json({ choices: [{ message: { content: JSON.stringify({ text: proposed, language: 'fr' }) } }] });
      };
      const value = fixture(true, text);
      await value.service.create(eventId, designId, 'owner-a', 'Bearer test', { workflow: 'EDITORIAL_COMPRESSION', elementId: 'invitation', sourceVersion: 1, language: 'fr', compressionLevel: 'BALANCED' });
      await value.service.process(jobId);
      assert.equal(value.current()?.['sourceDocument'].sourceText, text);
      if (mode === 'still_long') { assert.equal(value.current()?.['status'], 'PROPOSED'); assert.equal(value.current()?.['proposal'].fits, false); }
      else assert.equal(value.current()?.['status'], 'FAILED', mode);
    }
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of ['AI_PROVIDER', 'AI_PROVIDER_URL', 'AI_PROVIDER_MODEL']) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
});
