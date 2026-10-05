import { deflateSync } from 'node:zlib';
const crc = (bytes) => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1; } return (value ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const tag = Buffer.from(type), body = Buffer.concat([tag, data]), result = Buffer.alloc(data.length + 12); result.writeUInt32BE(data.length); body.copy(result, 4); result.writeUInt32BE(crc(body), result.length - 4); return result; };
/** Synthetic RGBA raster with recognizable quadrants and an optional transparent perimeter. */
export function syntheticPng(width, height, alpha = false) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * (width * 4 + 1) + 1 + x * 4, nx = x / width, ny = y / height;
    rows[i] = nx < 0.5 ? 54 : 217; rows[i + 1] = ny < 0.5 ? 157 : 89; rows[i + 2] = Math.round(95 + nx * 90);
    const radius = Math.hypot((nx - 0.5) / 0.45, (ny - 0.5) / 0.48);
    rows[i + 3] = alpha ? Math.round(Math.max(0, Math.min(1, (1 - radius) * 12)) * 255) : 255;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
