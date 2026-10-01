const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 8_000;
const MAX_IMAGE_PIXELS = 40_000_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_CRC_TABLE = createPngCrcTable();

const FORMATS = {
  png: { mimeType: 'image/png', extensions: new Set(['png']) },
  jpeg: { mimeType: 'image/jpeg', extensions: new Set(['jpg', 'jpeg']) },
  webp: { mimeType: 'image/webp', extensions: new Set(['webp']) },
};

export class ImageValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ImageValidationError';
    this.code = code;
  }
}

export function inspectUserImage(bytes, filename, declaredMimeType) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0)
    fail('EMPTY_FILE', 'Le fichier image est vide ou invalide.');
  if (bytes.length > MAX_IMAGE_BYTES)
    fail('FILE_TOO_LARGE', 'Une image ne peut pas dépasser 5 Mio.');
  if (
    typeof filename !== 'string' ||
    filename.length > 255 ||
    /[\u0000-\u001f\u007f]/.test(filename)
  ) {
    fail('INVALID_FILENAME', 'Le nom du fichier image est invalide.');
  }

  const format = detectFormat(bytes);
  const definition = FORMATS[format];
  const extension = filename.split(/[\\/]/).at(-1)?.split('.').at(-1)?.toLowerCase();
  const mimeType =
    typeof declaredMimeType === 'string'
      ? declaredMimeType.split(';', 1)[0]?.trim().toLowerCase()
      : '';
  if (!extension || !definition.extensions.has(extension) || mimeType !== definition.mimeType) {
    fail(
      'IMAGE_TYPE_MISMATCH',
      'Le type, l’extension et le contenu de l’image doivent correspondre (PNG, JPEG ou WebP).',
    );
  }

  const dimensions =
    format === 'png'
      ? inspectPng(bytes)
      : format === 'jpeg'
        ? inspectJpeg(bytes)
        : inspectWebp(bytes);
  validateDimensions(dimensions.width, dimensions.height);
  return Object.freeze({
    format,
    mimeType: definition.mimeType,
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: bytes.length,
  });
}

function detectFormat(bytes) {
  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, 8).equals(PNG_SIGNATURE))
    return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg';
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  fail('UNSUPPORTED_IMAGE', 'Seules les images PNG, JPEG et WebP sont acceptées.');
}

function inspectPng(bytes) {
  let offset = 8;
  let width;
  let height;
  let sawData = false;
  let sawEnd = false;
  let chunkIndex = 0;

  while (offset + 12 <= bytes.length) {
    const chunkLength = bytes.readUInt32BE(offset);
    const chunkType = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const crcOffset = dataStart + chunkLength;
    if (
      chunkLength > MAX_IMAGE_BYTES ||
      crcOffset + 4 > bytes.length ||
      !/^[A-Za-z]{4}$/.test(chunkType)
    ) {
      fail('INVALID_PNG', 'La structure du PNG est invalide.');
    }
    if (readPngCrc(bytes, offset + 4, crcOffset) !== bytes.readUInt32BE(crcOffset)) {
      fail('INVALID_PNG', 'La somme de contrôle d’un bloc PNG est invalide.');
    }

    if (chunkIndex === 0) {
      if (chunkType !== 'IHDR' || chunkLength !== 13)
        fail('INVALID_PNG', 'Le PNG ne commence pas par un en-tête IHDR valide.');
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      validatePngHeader(bytes, dataStart);
    } else if (chunkType === 'IHDR') {
      fail('INVALID_PNG', 'Le PNG contient plusieurs blocs IHDR.');
    }

    if (chunkType === 'IDAT' && chunkLength > 0) sawData = true;
    if (chunkType === 'acTL' || chunkType === 'fcTL' || chunkType === 'fdAT') {
      fail('ANIMATED_IMAGE', 'Les images PNG animées ne sont pas acceptées.');
    }
    offset = crcOffset + 4;
    chunkIndex += 1;
    if (chunkType === 'IEND') {
      if (chunkLength !== 0 || offset !== bytes.length)
        fail('INVALID_PNG', 'Le PNG contient des données après sa fin.');
      sawEnd = true;
      break;
    }
  }

  if (!sawData || !sawEnd || width === undefined || height === undefined)
    fail('INVALID_PNG', 'Le PNG est tronqué ou incomplet.');
  return { width, height };
}

function validatePngHeader(bytes, dataStart) {
  const bitDepth = bytes[dataStart + 8];
  const colorType = bytes[dataStart + 9];
  const validDepths = new Map([
    [0, [1, 2, 4, 8, 16]],
    [2, [8, 16]],
    [3, [1, 2, 4, 8]],
    [4, [8, 16]],
    [6, [8, 16]],
  ]);
  if (
    !validDepths.get(colorType)?.includes(bitDepth) ||
    bytes[dataStart + 10] !== 0 ||
    bytes[dataStart + 11] !== 0 ||
    bytes[dataStart + 12] > 1
  ) {
    fail('INVALID_PNG', 'Les paramètres de décodage du PNG sont invalides.');
  }
}

function inspectJpeg(bytes) {
  if (bytes.length < 4 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9)
    fail('INVALID_JPEG', 'Le JPEG est tronqué ou contient des données après sa fin.');
  let offset = 2;
  let width;
  let height;
  let sawScan = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff)
      fail('INVALID_JPEG', 'La structure des segments JPEG est invalide.');
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) fail('INVALID_JPEG', 'Un segment JPEG est incomplet.');
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length)
      fail('INVALID_JPEG', 'La longueur d’un segment JPEG est invalide.');
    const dataStart = offset + 2;
    const dataLength = segmentLength - 2;
    if (marker === 0xc0 || marker === 0xc2) {
      if (dataLength < 6 || bytes[dataStart] !== 8)
        fail('INVALID_JPEG', 'Le segment de dimensions JPEG est invalide.');
      const componentCount = bytes[dataStart + 5];
      if (![1, 3, 4].includes(componentCount) || dataLength !== 6 + componentCount * 3)
        fail('INVALID_JPEG', 'Le segment de dimensions JPEG est incomplet.');
      height = bytes.readUInt16BE(dataStart + 1);
      width = bytes.readUInt16BE(dataStart + 3);
    }
    offset += segmentLength;
    if (marker === 0xda) {
      sawScan = true;
      break;
    }
  }
  if (!sawScan || width === undefined || height === undefined)
    fail('INVALID_JPEG', 'Le JPEG ne contient pas de dimensions et de données image valides.');
  return { width, height };
}

function inspectWebp(bytes) {
  if (bytes.readUInt32LE(4) !== bytes.length - 8)
    fail('INVALID_WEBP', 'La longueur RIFF du WebP ne correspond pas au fichier.');
  let offset = 12;
  let width;
  let height;
  let sawImage = false;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.toString('ascii', offset, offset + 4);
    const chunkLength = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const paddedLength = chunkLength + (chunkLength & 1);
    if (dataStart + paddedLength > bytes.length)
      fail('INVALID_WEBP', 'Un bloc WebP dépasse la taille du fichier.');

    if (chunkType === 'VP8X') {
      if (chunkLength !== 10) fail('INVALID_WEBP', 'Le bloc VP8X est invalide.');
      if (bytes[dataStart] & 0x02)
        fail('ANIMATED_IMAGE', 'Les images WebP animées ne sont pas acceptées.');
      width = 1 + readUInt24LE(bytes, dataStart + 4);
      height = 1 + readUInt24LE(bytes, dataStart + 7);
    } else if (chunkType === 'VP8 ' && chunkLength >= 10) {
      if (
        bytes[dataStart + 3] === 0x9d &&
        bytes[dataStart + 4] === 0x01 &&
        bytes[dataStart + 5] === 0x2a
      ) {
        width ??= bytes.readUInt16LE(dataStart + 6) & 0x3fff;
        height ??= bytes.readUInt16LE(dataStart + 8) & 0x3fff;
        sawImage = true;
      }
    } else if (chunkType === 'VP8L' && chunkLength >= 5 && bytes[dataStart] === 0x2f) {
      const b1 = bytes[dataStart + 1];
      const b2 = bytes[dataStart + 2];
      const b3 = bytes[dataStart + 3];
      const b4 = bytes[dataStart + 4];
      width ??= 1 + ((b2 & 0x3f) << 8) + b1;
      height ??= 1 + ((b4 & 0x0f) << 10) + (b3 << 2) + ((b2 & 0xc0) >> 6);
      sawImage = true;
    } else if (chunkType === 'ANIM' || chunkType === 'ANMF') {
      fail('ANIMATED_IMAGE', 'Les images WebP animées ne sont pas acceptées.');
    }

    offset = dataStart + paddedLength;
  }
  if (offset !== bytes.length || !sawImage || width === undefined || height === undefined)
    fail('INVALID_WEBP', 'Le WebP est tronqué ou ne contient pas de trame image.');
  return { width, height };
}

function validateDimensions(width, height) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    fail(
      'IMAGE_DIMENSIONS_EXCEEDED',
      'Les dimensions de l’image dépassent les limites autorisées.',
    );
  }
}

function readUInt24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function createPngCrcTable() {
  return Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    return crc >>> 0;
  });
}

function readPngCrc(bytes, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1)
    crc = PNG_CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function fail(code, message) {
  throw new ImageValidationError(code, message);
}
