import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { pdfImage, pdfPaperTexture } from './pdf-image.js';
test('PDF photo variants use physical resolution and JPEG without modifying the original',async()=>{
  const original=await sharp({create:{width:1200,height:1800,channels:3,background:'#987654'}}).png().toBuffer();
  const before=Buffer.from(original),uri=await pdfImage(original,600,600);
  assert.match(uri,/^data:image\/jpeg;/);assert.deepEqual(original,before);
  const meta=await sharp(Buffer.from(uri.split(',')[1]!, 'base64')).metadata();
  assert.equal(meta.width,600);assert.equal(meta.height,900);assert.equal(meta.hasAlpha,false);
});
test('transparent resources keep alpha and the generated paper is bounded and reused',async()=>{
  const pixels=Buffer.alloc(64*64*4,255);for(let i=0;i<32*64;i++)pixels[i*4+3]=0;
  const original=await sharp(pixels,{raw:{width:64,height:64,channels:4}}).png().toBuffer();
  const uri=await pdfImage(original,64,64);assert.match(uri,/^data:image\/png;/);
  const decoded=await sharp(Buffer.from(uri.split(',')[1]!, 'base64')).raw().toBuffer();
  assert.equal(decoded[3],0);assert.equal(decoded.at(-1),255);
  const paper=await pdfPaperTexture();assert.match(paper,/^data:image\/jpeg;/);assert.ok(paper.length<500000);assert.equal(await pdfPaperTexture(),paper);
});
