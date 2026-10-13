import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlankDesign, editableDocument, insertEditableImage, createReferenceTemplate, validateDesignDocumentV2, resolveDesignLayout, renderResolvedLayoutSvg, assertProfessionalPersonalization } from '../src/index.mjs';

test('blank and reference editing preserve separate editable artwork and the original document', () => {
  const blank = createBlankDesign();
  assert.equal(blank.elements.length, 1);
  for (const name of ['reference-01-ivory','reference-02-gold']) {
    const original = createReferenceTemplate(name), before = JSON.stringify(original);
    const doc = editableDocument(original);
    assert.equal(JSON.stringify(original), before);
    assert.ok(doc.elements.filter(layer => layer.ornamentId).length > 2);
    assert.ok(doc.elements.some(layer => layer.ornamentId?.startsWith('paper-')));
    assert.ok(!doc.elements.some(layer => ['reference-ivory-v1','reference-gold-v1'].includes(layer.ornamentId)));
    assert.doesNotThrow(() => validateDesignDocumentV2(doc));
    assert.doesNotThrow(() => assertProfessionalPersonalization(original, doc, { fullEditing: true }));
    assert.throws(() => assertProfessionalPersonalization(original, doc));
  }
});

test('private photos and background textures stay independent, replaceable and rendered', () => {
  const asset = { assetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', width: 640, height: 480 };
  const blank = createBlankDesign(), initial = JSON.stringify(blank);
  blank.metadata.mediaStrategy = 'NO_PHOTO';
  let result = insertEditableImage(blank, asset);
  assert.equal(blank.elements.length, 1);
  assert.equal(JSON.stringify(createBlankDesign()), initial);
  const photo = result.document.elements.find(layer => layer.id === result.layerId);
  assert.equal(photo.type, 'IMAGE'); assert.equal(photo.assetId, asset.assetId);
  const background = result.document.elements.find(layer => layer.type === 'BACKGROUND');
  background.locked = false; background.editable = true;
  result = insertEditableImage(result.document, asset, background.id);
  assert.equal(result.document.elements.filter(layer => layer.type === 'BACKGROUND').length, 1);
  assert.equal(result.document.elements.find(layer => layer.id === result.layerId).width, blank.canvas.width);
  const count = result.document.elements.length;
  result = insertEditableImage(result.document, { ...asset, assetId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, background.id);
  assert.equal(result.document.elements.length, count);
  const snapshot = JSON.parse(JSON.stringify(result.document));
  const layout = resolveDesignLayout(snapshot, {}, undefined, { [asset.assetId]: 'data:image/png;base64,test', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb': 'data:image/png;base64,test' }, { mode: 'web' });
  assert.match(renderResolvedLayoutSvg(layout), /<image/);
  snapshot.elements.find(layer => layer.id === result.layerId).locked = true;
  assert.throws(() => insertEditableImage(snapshot, asset, background.id), /Déverrouillez/);
  assert.throws(() => insertEditableImage(snapshot, asset, 'missing'));
  const reference = editableDocument(createReferenceTemplate('reference-01-ivory'));
  const ornament = reference.elements.find(layer => layer.ornamentId === 'flower');
  const converted = insertEditableImage(reference, asset, ornament.id);
  const replacement = converted.document.elements.find(layer => layer.id === ornament.id);
  assert.equal(replacement.role, 'DECORATION'); assert.equal(replacement.ornamentId, undefined);
  assert.equal(replacement.width, ornament.width); assert.equal(reference.elements.find(layer => layer.id === ornament.id).type, 'SHAPE');
});

test('added text, styling, hidden flags and complete composition survive JSON and shared rendering', () => {
  const doc = createBlankDesign();
  doc.elements.push({ id:'custom-text', name:'Mon texte', type:'TEXT', x:100,y:400,width:800,height:120,rotation:15,locked:false,editable:true,zIndex:2,text:'Invitation personnalisée',fontId:'arial',fontFamily:'Arial',preferredFontSize:36,fontSize:36,minFontSize:8,maxFontSize:36,lineHeight:1.2,letterSpacing:2,overflowPolicy:'SHRINK_WITH_LIMIT',color:'#32163a',opacity:.8 });
  const restored = JSON.parse(JSON.stringify(doc));
  validateDesignDocumentV2(restored);
  const layout = resolveDesignLayout(restored,{guest:{name:'Exemple'},ceremonies:[],qr:{available:false}},undefined,{}, {mode:'web'});
  assert.equal(layout.elements.find(layer=>layer.id==='custom-text').resolvedText,'Invitation personnalisée');
  const svg = renderResolvedLayoutSvg(layout);
  assert.match(svg,/rotate\(15/); assert.match(svg,/letter-spacing="2"/); assert.match(svg,/opacity="0.8"/);
  restored.elements[1].hidden=true;
  assert.ok(!resolveDesignLayout(restored,{},undefined,{}, {mode:'web'}).elements.some(layer=>layer.id==='custom-text'));
  restored.elements[1].hidden='yes'; assert.throws(()=>validateDesignDocumentV2(restored));
});
