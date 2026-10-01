import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { AntivirusScanError, scanWithClamAV } from './antivirus-scan.mjs';

async function fakeClamd(reply, verifyStream) {
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let commandRead = false;
    let payload = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!commandRead) {
        const commandEnd = buffer.indexOf(0);
        if (commandEnd < 0) return;
        assert.equal(buffer.subarray(0, commandEnd).toString('ascii'), 'zINSTREAM');
        buffer = buffer.subarray(commandEnd + 1);
        commandRead = true;
      }
      while (buffer.length >= 4) {
        const size = buffer.readUInt32BE(0);
        if (buffer.length < size + 4) break;
        buffer = buffer.subarray(4);
        if (size === 0) {
          verifyStream(payload);
          socket.write(Buffer.from(reply));
          socket.end();
          return;
        }
        payload = Buffer.concat([payload, buffer.subarray(0, size)]);
        buffer = buffer.subarray(size);
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    host: '127.0.0.1',
    port: address.port,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

test('sends bounded INSTREAM frames to ClamAV and accepts a clean scan', async () => {
  const bytes = Buffer.alloc(150_000, 0x2a);
  const scanner = await fakeClamd('stream: OK\0', (received) => assert.deepEqual(received, bytes));
  try {
    assert.deepEqual(await scanWithClamAV(bytes, scanner), { clean: true });
  } finally {
    await scanner.close();
  }
});

test('rejects malware reported by ClamAV without exposing the signature name', async () => {
  const scanner = await fakeClamd('stream: Eicar-Test-Signature FOUND\0', () => {});
  try {
    await assert.rejects(
      scanWithClamAV(Buffer.from('test payload'), scanner),
      (error) =>
        error instanceof AntivirusScanError &&
        error.code === 'MALWARE_DETECTED' &&
        !error.message.includes('Eicar'),
    );
  } finally {
    await scanner.close();
  }
});

test('fails closed on scanner errors, malformed replies and invalid settings', async () => {
  const scanner = await fakeClamd('unexpected\0', () => {});
  try {
    await assert.rejects(
      scanWithClamAV(Buffer.from('test payload'), scanner),
      (error) => error instanceof AntivirusScanError && error.code === 'SCANNER_PROTOCOL_ERROR',
    );
  } finally {
    await scanner.close();
  }

  await assert.rejects(
    scanWithClamAV(Buffer.from('test payload'), { host: 'bad host', port: 3310 }),
    (error) => error instanceof AntivirusScanError && error.code === 'INVALID_CONFIGURATION',
  );
});
