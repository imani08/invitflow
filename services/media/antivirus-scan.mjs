import { createConnection } from 'node:net';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const STREAM_CHUNK_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 4096;

export class AntivirusScanError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AntivirusScanError';
    this.code = code;
  }
}

export async function scanWithClamAV(bytes, { host, port, timeoutMs = 30_000 }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new AntivirusScanError('INVALID_INPUT', 'Le fichier à analyser est invalide.');
  }
  if (
    typeof host !== 'string' ||
    host.length > 253 ||
    !/^[A-Za-z0-9.-]+$/.test(host) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 120_000
  ) {
    throw new AntivirusScanError(
      'INVALID_CONFIGURATION',
      'La configuration antivirus est invalide.',
    );
  }

  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const responseChunks = [];
    let responseSize = 0;
    let settled = false;
    const timer = setTimeout(() => {
      finish(new AntivirusScanError('SCANNER_UNAVAILABLE', 'Le service antivirus ne répond pas.'));
    }, timeoutMs);

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve({ clean: true });
    };

    socket.once('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0'));
      for (let offset = 0; offset < bytes.length; offset += STREAM_CHUNK_BYTES) {
        const chunk = bytes.subarray(offset, Math.min(offset + STREAM_CHUNK_BYTES, bytes.length));
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });

    socket.on('data', (chunk) => {
      responseSize += chunk.length;
      if (responseSize > MAX_RESPONSE_BYTES) {
        finish(new AntivirusScanError('SCANNER_PROTOCOL_ERROR', 'Réponse antivirus invalide.'));
        return;
      }
      responseChunks.push(chunk);
      const response = Buffer.concat(responseChunks, responseSize);
      const end = response.indexOf(0);
      if (end < 0) return;
      const result = response.subarray(0, end).toString('utf8');
      if (/^stream: OK$/.test(result)) finish();
      else if (/^stream: .+ FOUND$/.test(result))
        finish(
          new AntivirusScanError('MALWARE_DETECTED', 'Le fichier contient un contenu malveillant.'),
        );
      else finish(new AntivirusScanError('SCANNER_PROTOCOL_ERROR', 'Réponse antivirus invalide.'));
    });

    socket.once('error', () => {
      finish(
        new AntivirusScanError('SCANNER_UNAVAILABLE', 'Le service antivirus est indisponible.'),
      );
    });
    socket.once('close', () => {
      if (!settled)
        finish(
          new AntivirusScanError(
            'SCANNER_UNAVAILABLE',
            'Le service antivirus a interrompu le scan.',
          ),
        );
    });
  });
}
