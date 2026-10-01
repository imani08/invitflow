import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { formulaMarker, isUnsafeSpreadsheetValue, parseGuestFile } from './guest-import.parser.js';

const parseCsv = (text: string, mime = 'text/csv') =>
  parseGuestFile('guests.csv', mime, Buffer.from(text));

async function xlsxBuffer(headers: string[], rows: string[][] = [['Imani K.']]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Invités');
  worksheet.addRow(headers);
  for (const row of rows) worksheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function mutateZipCentralDirectory(buffer: Buffer, mutateEntry: (buffer: Buffer, offset: number) => boolean) {
  const copy = Buffer.from(buffer);
  const searchStart = Math.max(0, copy.length - 65_557);
  let eocd = -1;
  for (let offset = copy.length - 22; offset >= searchStart; offset--) {
    if (copy.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  assert.notEqual(eocd, -1, 'test workbook should have a ZIP end record');
  let offset = copy.readUInt32LE(eocd + 16);
  const entries = copy.readUInt16LE(eocd + 10);
  let mutations = 0;
  for (let index = 0; index < entries; index++) {
    assert.equal(copy.readUInt32LE(offset), 0x02014b50, 'test workbook should have valid central entries');
    if (mutateEntry(copy, offset)) mutations++;
    offset += 46 + copy.readUInt16LE(offset + 28) + copy.readUInt16LE(offset + 30) + copy.readUInt16LE(offset + 32);
  }
  assert.ok(mutations > 0, 'test should mutate at least one ZIP entry');
  return copy;
}

test('parses UTF-8 CSV headers, rows and quoted delimiters', async () => {
  const result = await parseCsv('Nom,Email\n"Imani, K.",imani@example.test\n');
  assert.equal(result.sheetName, 'CSV');
  assert.deepEqual(result.headers, ['Nom', 'Email']);
  assert.deepEqual(result.rows, [['Imani, K.', 'imani@example.test']]);
});

test('flags spreadsheet formula injection prefixes and Excel formula cells', () => {
  for (const value of ['=1+1', '+SUM(A1:A2)', '@SUM(A1)', '  -2', `${formulaMarker()}SUM(A1)`]) {
    assert.equal(isUnsafeSpreadsheetValue(value), true, `${value} should be flagged`);
  }
  assert.equal(isUnsafeSpreadsheetValue('+243 000 000 000', true), false);
  assert.equal(isUnsafeSpreadsheetValue('Imani'), false);
});

test('rejects malformed UTF-8, invalid MIME and non-XLSX bytes', async () => {
  await assert.rejects(
    parseGuestFile('guests.csv', 'application/pdf', Buffer.from('Nom\nA\n')),
    /type MIME/i,
  );
  await assert.rejects(
    parseGuestFile('guests.csv', 'text/csv', Buffer.from([0xc3, 0x28])),
    /UTF-8/i,
  );
  await assert.rejects(
    parseGuestFile('guests.xlsx', 'application/zip', Buffer.from('not a workbook')),
    /type ou le contenu/i,
  );
});

test('rejects oversized guest imports before parsing', async () => {
  const content = Buffer.alloc(5 * 1024 * 1024 + 1, 0x20);
  await assert.rejects(parseGuestFile('guests.csv', 'text/csv', content), /maximum 5 Mo/i);
});

test('rejects an import that exceeds the supported row limit', async () => {
  const rows = ['Nom', ...Array.from({ length: 1_001 }, (_, index) => `Invité ${index}`)].join(
    '\n',
  );
  await assert.rejects(parseCsv(rows), /1000 invités/i);
});

test('rejects overlong cells and columns without headers', async () => {
  await assert.rejects(parseCsv(`Nom\n${'x'.repeat(1_001)}`), /cellule doit contenir/i);
  await assert.rejects(parseCsv('Nom\nInvité,extra'), /sans en-tête/i);
});

test('parses a valid XLSX workbook and retains its first visible sheet data', async () => {
  const file = await xlsxBuffer(['Nom', 'E-mail'], [['Imani K.', 'imani@example.test']]);
  const result = await parseGuestFile(
    'guests.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    file,
  );
  assert.equal(result.sheetName, 'Invités');
  assert.deepEqual(result.headers, ['Nom', 'E-mail']);
  assert.deepEqual(result.rows, [['Imani K.', 'imani@example.test']]);
});

test('rejects XLSX sheets that exceed column and cell limits', async () => {
  const manyColumns = await xlsxBuffer(
    Array.from({ length: 41 }, (_, index) => `Colonne ${index + 1}`),
  );
  await assert.rejects(
    parseGuestFile('guests.xlsx', 'application/zip', manyColumns),
    /limites de lignes ou de colonnes|maximum 40 colonnes/i,
  );

  const longCell = await xlsxBuffer(['Nom'], [[`${'Invité '.repeat(150)}x`]]);
  await assert.rejects(
    parseGuestFile('guests.xlsx', 'application/zip', longCell),
    /cellule doit contenir|décompression autorisées/i,
  );
});

test('rejects a truncated XLSX ZIP archive before invoking the workbook parser', async () => {
  const truncated = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array.from({ length: 18 }, () => 0)]);
  await assert.rejects(
    parseGuestFile('guests.xlsx', 'application/zip', truncated),
    /XLSX est invalide/i,
  );
});

test('rejects an XLSX entry with a zip-bomb compression ratio', async () => {
  const valid = await xlsxBuffer(['Nom'], [['Invité']]);
  const bomb = mutateZipCentralDirectory(valid, (archive, offset) => {
    const compressedSize = archive.readUInt32LE(offset + 20);
    if (compressedSize === 0) return false;
    archive.writeUInt32LE(compressedSize * 101, offset + 24);
    return true;
  });

  await assert.rejects(
    parseGuestFile('guests.xlsx', 'application/zip', bomb),
    /décompression autorisées/i,
  );
});

test('rejects an XLSX whose declared total expanded size exceeds the archive budget', async () => {
  const valid = await xlsxBuffer(['Nom'], [['Invité']]);
  let changed = 0;
  const bomb = mutateZipCentralDirectory(valid, (archive, offset) => {
    if (changed >= 5) return false;
    archive.writeUInt32LE(1024 * 1024, offset + 20);
    archive.writeUInt32LE(5 * 1024 * 1024, offset + 24);
    changed++;
    return true;
  });

  await assert.rejects(
    parseGuestFile('guests.xlsx', 'application/zip', bomb),
    /contenu décompressé.*trop volumineux/i,
  );
});
