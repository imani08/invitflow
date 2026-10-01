import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ImageValidationError, inspectUserImage } from './image-validation.mjs';

test('preflights PNG, JPEG and WebP signatures, extensions, MIME types and dimensions', () => {
  assert.deepEqual(inspectUserImage(pngImage(640, 480), 'portrait.png', 'image/png'), {
    format: 'png',
    mimeType: 'image/png',
    width: 640,
    height: 480,
    sizeBytes: pngImage(640, 480).length,
  });
  assert.deepEqual(inspectUserImage(jpegImage(1200, 800), 'portrait.jpg', 'image/jpeg'), {
    format: 'jpeg',
    mimeType: 'image/jpeg',
    width: 1200,
    height: 800,
    sizeBytes: jpegImage(1200, 800).length,
  });
  assert.deepEqual(inspectUserImage(webpImage(1024, 768), 'portrait.webp', 'image/webp'), {
    format: 'webp',
    mimeType: 'image/webp',
    width: 1024,
    height: 768,
    sizeBytes: webpImage(1024, 768).length,
  });
});

test('rejects SVG, unknown formats and mismatched declared types or extensions', () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.throws(
    () => inspectUserImage(svg, 'art.svg', 'image/svg+xml'),
    hasCode('UNSUPPORTED_IMAGE'),
  );
  assert.throws(
    () => inspectUserImage(pngImage(10, 10), 'art.jpg', 'image/jpeg'),
    hasCode('IMAGE_TYPE_MISMATCH'),
  );
  assert.throws(
    () => inspectUserImage(pngImage(10, 10), 'art.png', 'image/webp'),
    hasCode('IMAGE_TYPE_MISMATCH'),
  );
  assert.throws(
    () => inspectUserImage(Buffer.from('not an image'), 'art.png', 'image/png'),
    hasCode('UNSUPPORTED_IMAGE'),
  );
});

test('rejects malformed PNG chunks, CRC errors and appended data', () => {
  const valid = pngImage(10, 10);
  const brokenCrc = Buffer.from(valid);
  brokenCrc[29] ^= 0xff;
  assert.throws(
    () => inspectUserImage(brokenCrc, 'broken.png', 'image/png'),
    hasCode('INVALID_PNG'),
  );
  assert.throws(
    () =>
      inspectUserImage(Buffer.concat([valid, Buffer.from('payload')]), 'appended.png', 'image/png'),
    hasCode('INVALID_PNG'),
  );
});

test('rejects oversized images, pixel bombs and animated image formats', () => {
  assert.throws(
    () => inspectUserImage(Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png', 'image/png'),
    hasCode('FILE_TOO_LARGE'),
  );
  assert.throws(
    () => inspectUserImage(pngImage(8000, 8000), 'pixels.png', 'image/png'),
    hasCode('IMAGE_DIMENSIONS_EXCEEDED'),
  );
  assert.throws(
    () => inspectUserImage(webpImage(100, 100, { animated: true }), 'motion.webp', 'image/webp'),
    hasCode('ANIMATED_IMAGE'),
  );
});

function hasCode(code) {
  return (error) => error instanceof ImageValidationError && error.code === code;
}

function pngImage(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function jpegImage(width, height) {
  const sof = Buffer.from([
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
  ]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, sos, Buffer.from([0xff, 0xd9])]);
}

function webpImage(width, height, { animated = false } = {}) {
  const extended = Buffer.alloc(18);
  extended.write('VP8X', 0, 'ascii');
  extended.writeUInt32LE(10, 4);
  extended[8] = animated ? 0x02 : 0;
  writeUInt24LE(extended, 12, width - 1);
  writeUInt24LE(extended, 15, height - 1);
  const frame = Buffer.from([
    0x56, 0x50, 0x38, 0x20, 10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, 0, 0, 0, 0,
  ]);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'ascii');
  riff.write('WEBP', 8, 'ascii');
  const file = Buffer.concat([riff, extended, frame]);
  file.writeUInt32LE(file.length - 8, 4);
  return file;
}

function writeUInt24LE(buffer, offset, value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
}
