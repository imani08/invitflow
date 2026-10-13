import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlankDesign, createInitialComposition, moveEditableGroup, editableDocument, insertEditableImage, createReferenceTemplate, validateDesignDocumentV2, resolveDesignLayout, renderResolvedLayoutSvg, assertProfessionalPersonalization } from '../src/index.mjs';

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

test('group translation keeps relative positions, clamps together, persists and renders', () => {
  const source=createInitialComposition(), a=source.elements.find(layer=>layer.id==='ai-invitation-prose');
  const b={...structuredClone(a),id:'second-text',name:'Deuxième texte',x:a.x+100,y:a.y+250};source.elements.push(b);
  source.metadata.editorGroups=[{id:'group-1',name:'Groupe',elementIds:[a.id,b.id]}];
  const prior=JSON.stringify(source), moved=moveEditableGroup(source,a.id,a.x+50,a.y+80);
  const first=moved.elements.find(layer=>layer.id===a.id),second=moved.elements.find(layer=>layer.id===b.id);
  assert.equal(first.x-a.x,50);assert.equal(second.x-first.x,100);assert.equal(second.y-first.y,250);assert.equal(JSON.stringify(source),prior);
  const edge=moveEditableGroup(moved,a.id,99999,99999);const one=edge.elements.find(layer=>layer.id===a.id),two=edge.elements.find(layer=>layer.id===b.id);
  assert.equal(two.x-one.x,100);assert.equal(two.y-one.y,250);assert.ok(two.x+two.width<=edge.canvas.width);
  const restored=JSON.parse(JSON.stringify(moved));validateDesignDocumentV2(restored);
  const layout=resolveDesignLayout(restored,{},undefined,{}, {mode:'web'});
  assert.equal(layout.elements.find(layer=>layer.sourceElementId===a.id||layer.id===a.id).x,first.x);
  restored.elements.find(layer=>layer.id===b.id).locked=true;assert.throws(()=>moveEditableGroup(restored,a.id,0,0),/Déverrouillez/);
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

test('PDF JPEG variants and bounded paper textures render without allowing external or SVG sources',()=>{
  const jpeg='data:image/jpeg;base64,/9j/2Q==',id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const doc=insertEditableImage(createBlankDesign(),{assetId:id,width:640,height:480}).document;
  const layout=resolveDesignLayout(doc,{},undefined,{[id]:jpeg},{mode:'web'});
  assert.match(renderResolvedLayoutSvg(layout,{assets:{[id]:jpeg}}),/data:image\/jpeg/);
  assert.throws(()=>renderResolvedLayoutSvg(layout,{assets:{[id]:'data:image/svg+xml;base64,PHN2Zz4='}}));
  const reference=resolveDesignLayout(createReferenceTemplate('reference-01-ivory'),{},undefined,{}, {mode:'web'});
  assert.match(renderResolvedLayoutSvg(reference,{paperTexture:jpeg}),/href="data:image\/jpeg/);
  assert.doesNotMatch(renderResolvedLayoutSvg(reference,{paperTexture:'https://external.invalid/texture'}),/external.invalid/);
});
