import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfessionalTemplate } from '@invitaflow/design-document';
import { AiDesignService } from './ai-design.service.js';

test('a persisted GPT result is reused without a second provider request', async () => {
  await runCheckpoint({ summary: 'Palette conservée', changes: [{ op: 'set_element_font', elementId: 'guest', value: 'Arial' }], visualPrompt: '' }, false, 'PROPOSED');
});

test('an uncertain GPT submission is never automatically submitted again', async () => {
  await runCheckpoint({ textSubmissionStarted: true }, false, 'FAILED', 'submission_uncertain');
});

test('an uncertain FLUX submission is never automatically submitted again', async () => {
  await runCheckpoint({ summary: 'Palette conservée', changes: [{ op: 'set_element_font', elementId: 'guest', value: 'Arial' }], fluxSubmissionStarted: true }, true, 'FAILED', 'submission_uncertain');
});

async function runCheckpoint(proposal: Record<string, unknown>, image: boolean, expected: string, errorCode?: string) {
  const oldFetch = globalThis.fetch;
  const oldProvider = process.env['AI_PROVIDER'];
  const oldImage = process.env['AI_IMAGE_PROVIDER'];
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('No provider request expected'); };
  process.env['AI_PROVIDER'] = 'openai';
  process.env['AI_IMAGE_PROVIDER'] = 'flux';
  const job = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', designId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', baseVersion: 1, sourceDocument: createProfessionalTemplate('typographic-luxury'), prompt: image ? 'VISUAL_VARIATION\nUne ambiance sobre' : 'Une ambiance sobre', proposal, status: 'QUEUED', errorCode: null as string | null };
  const delegate = {
    updateMany: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(job, data); return { count: 1 }; },
    findUnique: async () => job,
  };
  const tx = { aiDesignJob: delegate, outboxMessage: { create: async () => ({}) } };
  const prisma = { ...tx, $transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx) };
  try {
    await new AiDesignService(prisma as never, {} as never, {} as never, {} as never).process(job.id);
    assert.equal(job.status, expected);
    assert.equal(job.errorCode, errorCode ?? null);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldProvider === undefined) delete process.env['AI_PROVIDER']; else process.env['AI_PROVIDER'] = oldProvider;
    if (oldImage === undefined) delete process.env['AI_IMAGE_PROVIDER']; else process.env['AI_IMAGE_PROVIDER'] = oldImage;
  }
}
