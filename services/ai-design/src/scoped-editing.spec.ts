import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDesignChanges } from './providers.js';
import { AiDesignService } from './ai-design.service.js';
const source = () => ({ canvas: { width: 1080, height: 1530 }, metadata: { editorMode: 'FULL', aiEditScope: ['selected'] }, theme: { tokens: { primary: '#32163a' } }, variables: [], elements: [
  { id:'selected', type:'TEXT', text:'Bienvenue à notre fête', fontSize:36, minFontSize:8, fontId:'georgia', binding:undefined, locked:false, editable:true, x:100,y:100,width:600,height:100 },
  { id:'other', type:'TEXT', text:'À conserver', locked:false, editable:true, x:100,y:300,width:600,height:100 },
] });
test('AI scope and locks are enforced server-side while editable typography reaches the renderer', () => {
  const doc=source(), before=JSON.stringify(doc);
  const result=applyDesignChanges(doc,'Texte raccourci',[{op:'set_element_text',elementId:'selected',value:'Bienvenue !'},{op:'set_element_font_size',elementId:'selected',value:42}]);
  const layers=result.document['elements'] as Record<string,unknown>[];
  assert.equal(layers[0]!['text'],'Bienvenue !'); assert.equal(layers[0]!['preferredFontSize'],42);
  assert.equal(JSON.stringify(doc),before);
  assert.throws(()=>applyDesignChanges(doc,'Hors sélection',[{op:'set_element_color',elementId:'other',value:'#123456'}]));
  assert.throws(()=>applyDesignChanges(doc,'Palette entière',[{op:'set_theme_color',token:'primary',value:'#123456'}]));
  doc.elements[0]!.locked=true;
  assert.throws(()=>applyDesignChanges(doc,'Verrouillé',[{op:'set_element_text',elementId:'selected',value:'Non'}]));
  doc.elements[0]!.locked=false; Object.assign(doc.elements[0]!,{binding:'guest.name'});
  assert.throws(()=>applyDesignChanges(doc,'Champ automatique',[{op:'set_element_text',elementId:'selected',value:'Nom fixe'}]));
});

test('a scoped raster request rejects text before any transaction or provider call', async () => {
  const names = ['AI_PROVIDER', 'AI_IMAGE_PROVIDER', 'OPENAI_API_KEY', 'BFL_API_KEY'] as const;
  const previous = names.map(name => process.env[name]);
  Object.assign(process.env, { AI_PROVIDER: 'openai', AI_IMAGE_PROVIDER: 'flux', OPENAI_API_KEY: 'test-placeholder', BFL_API_KEY: 'test-placeholder' });
  let transactions = 0;
  try {
    const service = new AiDesignService({ $transaction: () => { transactions++; throw new Error('Unexpected transaction'); } } as never, { get: async () => ({ version: 1, document: source() }) } as never, {} as never, {} as never);
    await assert.rejects(service.create('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'test-owner', 'Bearer test', { prompt: 'Une décoration florale', generateImage: true, elementIds: ['selected'] }), /une seule image ou décoration/);
    assert.equal(transactions, 0);
  } finally {
    names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
  }
});
