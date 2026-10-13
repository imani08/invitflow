import sharp from 'sharp';

/** PDF-only variant. The immutable source and editing asset are never overwritten. */
export async function pdfImage(bytes: Buffer, width: number, height: number) {
  const image = sharp(bytes, { limitInputPixels: 8192 * 8192, failOn: 'error' });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error('Invalid PDF image dimensions');
  const scale = Math.min(1, Math.max(width / metadata.width, height / metadata.height));
  const resized = image.rotate().resize({ width: Math.max(1, Math.ceil(metadata.width * scale)), height: Math.max(1, Math.ceil(metadata.height * scale)), fit: 'inside', withoutEnlargement: true }).toColourspace('srgb');
  const transparent = metadata.hasAlpha && !(await sharp(bytes).stats()).isOpaque;
  const output = transparent ? await resized.png({ compressionLevel: 9 }).toBuffer() : await resized.removeAlpha().jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
  return `data:image/${transparent ? 'png' : 'jpeg'};base64,${output.toString('base64')}`;
}

let paper: Promise<string> | undefined;
export function pdfPaperTexture() {
  paper ??= (async () => {
    const width=768, height=1086, pixels=Buffer.alloc(width*height); let seed=19;
    for(let i=0;i<pixels.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=Math.max(0,Math.min(255,128+((seed>>>24)-128)*.35));}
    const bytes=await sharp(pixels,{raw:{width,height,channels:1}}).jpeg({quality:72}).toBuffer();
    return 'data:image/jpeg;base64,'+bytes.toString('base64');
  })();
  return paper;
}
