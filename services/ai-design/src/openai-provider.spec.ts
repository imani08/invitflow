import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfessionalTemplate } from '@invitaflow/design-document';
import { OpenAITextProvider, OpenAIEditorialProvider } from './openai-provider.js';
import { applyDesignChanges } from './providers.js';

test('GPT uses server-only Responses structured outputs and honors registered professional font changes', async () => {
  const previousFetch = globalThis.fetch; const previousKey = process.env['OPENAI_API_KEY'];
  process.env['OPENAI_API_KEY'] = 'test-only-not-a-real-key';
    const document = createProfessionalTemplate('typographic-luxury');
    const editable = document.elements.find(layer => layer['id'] === 'invitation')!;
    editable['locked'] = false; editable['editable'] = true;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), 'https://api.openai.com/v1/responses');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.type, 'json_schema');
      assert.equal(body.input.includes('guest list'), false);
      return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ summary: 'Police plus sobre.', changes: [{ op: 'set_element_font', elementId: 'invitation', value: 'Arial' }] }) }] }], usage: { input_tokens: 20, output_tokens: 30, total_tokens: 50, secret: 99 } });
    };
    const proposal = await new OpenAITextProvider().edit({ prompt: 'Une police plus moderne', document });
    assert.deepEqual(proposal.usage, { input_tokens: 20, output_tokens: 30, total_tokens: 50 });
    const result = applyDesignChanges(document, proposal.summary, proposal.changes);
    assert.equal((result.document['elements'] as Record<string, unknown>[]).find(layer => layer['id'] === 'invitation')?.['fontId'], 'arial');
    assert.deepEqual(document.elements.find(layer => layer['id'] === 'qr'), result.document['elements'] && (result.document['elements'] as Record<string, unknown>[]).find(layer => layer['id'] === 'qr'));
    assert.throws(() => applyDesignChanges(document, 'Déplacement interdit', [{ op: 'set_element_position', elementId: 'invitation', x: 1, y: 1 }]));
  } finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env['OPENAI_API_KEY']; else process.env['OPENAI_API_KEY'] = previousKey; }
});

test('GPT missing key, rejected request and malformed output fail without disclosing credentials', async () => {
  const previousFetch = globalThis.fetch; const previousKey = process.env['OPENAI_API_KEY'];
  const provider = new OpenAITextProvider(); const input = { prompt: 'Un style élégant', document: createProfessionalTemplate('typographic-luxury') };
  try {
    delete process.env['OPENAI_API_KEY']; await assert.rejects(provider.edit(input), /pas configuré/);
    process.env['OPENAI_API_KEY'] = 'test-private-key';
    globalThis.fetch = async () => new Response('test-private-key', { status: 503 });
    await assert.rejects(provider.edit(input), error => error instanceof Error && !error.message.includes('test-private-key'));
    globalThis.fetch = async () => Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: 'not json' }] }] });
    await assert.rejects(provider.edit(input), /invalide/);
    globalThis.fetch = async () => Response.json({ status: 'incomplete', output: [] });
    await assert.rejects(provider.edit(input), /terminé/);
  } finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env['OPENAI_API_KEY']; else process.env['OPENAI_API_KEY'] = previousKey; }
});

test('editorial GPT keeps the selected language and protected placeholders in the request', async () => {
  const previousFetch = globalThis.fetch; const previousKey = process.env['OPENAI_API_KEY'];
  process.env['OPENAI_API_KEY'] = 'test-only';
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)); assert.match(body.input, /__IF_PROTECTED_0__/);
      return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: 'Nous vous invitons avec __IF_PROTECTED_0__.', language: 'fr' }) }] }] });
    };
    const result = await new OpenAIEditorialProvider().compress({ text: 'Nous vous invitons pour notre célébration avec __IF_PROTECTED_0__.', language: 'fr', tone: 'warm', compressionLevel: 'BALANCED', targetLength: 80, maxEstimatedLines: 4, targetReductionRatio: 0.3 });
    assert.match(result.text, /__IF_PROTECTED_0__/);
  } finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env['OPENAI_API_KEY']; else process.env['OPENAI_API_KEY'] = previousKey; }
});
