/** Read trusted-container geometry before render. Does not decode, fetch or mutate image bytes. */
export function readPrivateImageDimensions(bytes, mimeType) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Image bytes are required');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at, text) => at + text.length <= bytes.length && [...text].every((char, index) => bytes[at + index] === char.charCodeAt(0));
  const dimensions = (width, height) => {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192) throw new TypeError('Image dimensions are outside the allowed range');
    return { width, height };
  };
  if (mimeType === 'image/png' && bytes.length >= 33 && bytes[0] === 137 && tag(1, 'PNG\r\n\x1a\n') && view.getUint32(8) === 13 && tag(12, 'IHDR')) return dimensions(view.getUint32(16), view.getUint32(20));
  if (mimeType === 'image/webp' && bytes.length >= 20 && tag(0, 'RIFF') && tag(8, 'WEBP') && view.getUint32(4, true) + 8 === bytes.length) {
    for (let at = 12; at + 8 <= bytes.length;) {
      const size = view.getUint32(at + 4, true), start = at + 8;
      if (start + size > bytes.length) break;
      if (tag(at, 'VP8X') && size >= 10) return dimensions(1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16), 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16));
      if (tag(at, 'VP8L') && size >= 5 && bytes[start] === 0x2f) { const bits = view.getUint32(start + 1, true); return dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1); }
      if (tag(at, 'VP8 ') && size >= 10 && bytes[start + 3] === 0x9d && bytes[start + 4] === 0x01 && bytes[start + 5] === 0x2a) return dimensions(view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff);
      at = start + size + (size % 2);
    }
  }
  throw new TypeError('A validated PNG/WebP image header is required');
}
