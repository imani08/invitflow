import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { ImageTranscodeError, transcodeUserImage } from './image-transcode.mjs';

test('decodes user image pixels and stores only normalized WebP output', async () => {
  const original = await sharp({
    create: { width: 4000, height: 2500, channels: 3, background: '#315f82' },
  })
    .png()
    .withMetadata({ exif: { IFD0: { Artist: 'private metadata' } } })
    .toBuffer();

  const converted = await transcodeUserImage(original);
  const metadata = await sharp(converted.bytes).metadata();

  assert.equal(converted.mimeType, 'image/webp');
  assert.equal(metadata.format, 'webp');
  assert.equal(converted.width, 4000);
  assert.equal(converted.height, 2500);
  assert.equal(metadata.exif, undefined);
  assert.ok(converted.bytes.length < original.length);

  const preview = await sharp(converted.preview).metadata();
  const thumbnail = await sharp(converted.thumbnail).metadata();
  assert.equal(preview.format, 'webp');
  assert.equal(thumbnail.format, 'webp');
  assert.equal(preview.width, 1280);
  assert.equal(preview.height, 800);
  assert.equal(thumbnail.width, 320);
  assert.equal(thumbnail.height, 200);
  assert.equal(preview.exif, undefined);
  assert.equal(thumbnail.exif, undefined);
});

test('rejects truncated content even when the filename and MIME are trusted', async () => {
  await assert.rejects(
    transcodeUserImage(Buffer.from('not a decodable image')),
    (error) => error instanceof ImageTranscodeError && error.code === 'IMAGE_DECODE_FAILED',
  );
});

test('rejects input and pixel bombs before producing a ready image', async () => {
  await assert.rejects(
    transcodeUserImage(Buffer.alloc(5 * 1024 * 1024 + 1)),
    (error) => error instanceof ImageTranscodeError && error.code === 'INVALID_INPUT',
  );

  const oversized = await sharp({
    create: { width: 7000, height: 7000, channels: 3, background: '#000' },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await assert.rejects(
    transcodeUserImage(oversized),
    (error) => error instanceof ImageTranscodeError && error.code === 'IMAGE_DECODE_FAILED',
  );
});
