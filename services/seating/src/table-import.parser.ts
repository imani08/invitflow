import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { inflateRawSync } from 'node:zlib';
import { maxImportBytes } from './env.js';

export const MAX_IMPORT_ROWS = 1_000;
export const MAX_IMPORT_COLUMNS = 40;
export const MAX_CELL_LENGTH = 1_000;
const FORMULA_MARKER = '__INVITAFLOW_FORMULA__';

export type ParsedGuestSheet = { sheetName: string; headers: string[]; rows: string[][] };

type ZipEntry = { name: string; method: number; flags: number; compressedSize: number; uncompressedSize: number; localOffset: number };

function inspectZip(buffer: Buffer): void {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) throw new BadRequestException('Le fichier XLSX est invalide.');
  const searchStart = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= searchStart; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new BadRequestException('Le fichier XLSX est invalide.');
  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const commentSize = buffer.readUInt16LE(eocd + 20);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries || totalEntries < 1 || totalEntries > 1_000
    || centralOffset + centralSize > eocd || eocd + 22 + commentSize !== buffer.length) {
    throw new BadRequestException('Le fichier XLSX contient une archive incorrecte ou trop volumineuse.');
  }

  const entries: ZipEntry[] = [];
  let position = centralOffset;
  let inflatedTotal = 0;
  for (let index = 0; index < totalEntries; index++) {
    if (position + 46 > centralOffset + centralSize || buffer.readUInt32LE(position) !== 0x02014b50) throw new BadRequestException('Le fichier XLSX contient une archive incorrecte.');
    const flags = buffer.readUInt16LE(position + 8);
    const method = buffer.readUInt16LE(position + 10);
    const compressedSize = buffer.readUInt32LE(position + 20);
    const uncompressedSize = buffer.readUInt32LE(position + 24);
    const filenameSize = buffer.readUInt16LE(position + 28);
    const extraSize = buffer.readUInt16LE(position + 30);
    const entryCommentSize = buffer.readUInt16LE(position + 32);
    const entryDisk = buffer.readUInt16LE(position + 34);
    const localOffset = buffer.readUInt32LE(position + 42);
    const end = position + 46 + filenameSize + extraSize + entryCommentSize;
    if (end > centralOffset + centralSize || entryDisk !== 0 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) throw new BadRequestException('Le fichier XLSX contient une archive incorrecte.');
    const name = buffer.toString('utf8', position + 46, position + 46 + filenameSize);
    if (name.includes('..') || name.startsWith('/') || name.includes('\\') || (flags & 1) !== 0 || ![0, 8].includes(method)) throw new BadRequestException('Le fichier XLSX contient un élément interdit.');
    if (uncompressedSize > 20 * 1024 * 1024 || compressedSize > 5 * 1024 * 1024 || (compressedSize > 0 && uncompressedSize / compressedSize > 100)) throw new BadRequestException('Le fichier XLSX dépasse les limites de décompression autorisées.');
    inflatedTotal += uncompressedSize;
    if (inflatedTotal > 20 * 1024 * 1024) throw new BadRequestException('Le contenu décompressé du fichier XLSX est trop volumineux.');
    entries.push({ name, method, flags, compressedSize, uncompressedSize, localOffset });
    position = end;
  }
  if (position !== centralOffset + centralSize) throw new BadRequestException('Le fichier XLSX contient une archive incorrecte.');
  const names = new Set(entries.map(({ name }) => name));
  if (!names.has('[Content_Types].xml') || !names.has('xl/workbook.xml') || !entries.some(({ name }) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))) throw new BadRequestException('Le fichier ne contient pas de classeur Excel valide.');
  if ([...names].some((name) => name.toLowerCase().endsWith('.xlsm') || name.toLowerCase().includes('vbaproject'))) throw new BadRequestException('Les classeurs avec macros ne sont pas acceptés.');

  for (const entry of entries.filter(({ name }) => name.endsWith('.xml') && (name.startsWith('xl/worksheets/') || name === 'xl/workbook.xml' || name === 'xl/sharedStrings.xml'))) {
    const xml = extractZipEntry(buffer, entry).toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new BadRequestException('Le fichier XLSX contient du XML interdit.');
    const dimension = /<dimension\b[^>]*\bref="([A-Z]+\d+):([A-Z]+\d+)"/i.exec(xml);
    if (dimension && (cellAddressTooLarge(dimension[1]!) || cellAddressTooLarge(dimension[2]!))) throw new BadRequestException('Le classeur dépasse les limites de lignes ou de colonnes.');
    let rowMatches = 0;
    for (const match of xml.matchAll(/<row\b[^>]*\br="(\d+)"/g)) {
      rowMatches++;
      if (Number(match[1]) > MAX_IMPORT_ROWS + 1 || rowMatches > MAX_IMPORT_ROWS + 1) throw new BadRequestException(`Un fichier ne peut contenir que ${MAX_IMPORT_ROWS} lignes de tables.`);
    }
    for (const match of xml.matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"/g)) if (cellAddressTooLarge(match[1]!)) throw new BadRequestException('Le classeur dépasse les limites de lignes ou de colonnes.');
  }
}

function cellAddressTooLarge(address: string): boolean {
  const match = /^([A-Z]+)(\d+)$/i.exec(address);
  if (!match) return true;
  let column = 0;
  for (const char of match[1]!.toUpperCase()) column = column * 26 + char.charCodeAt(0) - 64;
  return column > MAX_IMPORT_COLUMNS || Number(match[2]) > MAX_IMPORT_ROWS + 1;
}

function extractZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) throw new BadRequestException('Le fichier XLSX contient une entrée invalide.');
  const nameSize = buffer.readUInt16LE(offset + 26);
  const extraSize = buffer.readUInt16LE(offset + 28);
  const start = offset + 30 + nameSize + extraSize;
  const end = start + entry.compressedSize;
  if (end > buffer.length) throw new BadRequestException('Le fichier XLSX contient une entrée incomplète.');
  const localName = buffer.toString('utf8', offset + 30, offset + 30 + nameSize);
  if (localName !== entry.name) throw new BadRequestException('Le fichier XLSX contient une entrée incorrecte.');
  try {
    const inflated = entry.method === 0 ? buffer.subarray(start, end) : inflateRawSync(buffer.subarray(start, end), { maxOutputLength: 20 * 1024 * 1024 });
    if (inflated.length !== entry.uncompressedSize) throw new Error('Unexpected ZIP entry size');
    return inflated;
  } catch {
    throw new BadRequestException('Le fichier XLSX contient une archive incorrecte.');
  }
}

function stringCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['formula'] === 'string' || typeof record['sharedFormula'] === 'string') return `${FORMULA_MARKER}${String(record['formula'] ?? record['sharedFormula'])}`;
    if (Array.isArray(record['richText'])) return record['richText'].map((fragment) => fragment && typeof fragment === 'object' && typeof (fragment as Record<string, unknown>)['text'] === 'string' ? (fragment as Record<string, unknown>)['text'] as string : '').join('');
    if (typeof record['text'] === 'string') return record['text'];
  }
  return '';
}

function normalizeSheet(sheetName: string, rawRows: string[][]): ParsedGuestSheet {
  const first = rawRows.findIndex((row) => row.some((cell) => cell.trim() !== ''));
  if (first < 0) throw new BadRequestException('Le fichier ne contient aucune donnée.');
  const headers = rawRows[first]!.map((header) => header.trim());
  if (headers.length < 1 || headers.length > MAX_IMPORT_COLUMNS || headers.some((header) => header.length > 160)) throw new BadRequestException(`Le fichier doit contenir au maximum ${MAX_IMPORT_COLUMNS} colonnes.`);
  if (headers.every((header) => !header)) throw new BadRequestException('La première ligne non vide doit contenir les noms des colonnes.');
  const rows = rawRows.slice(first + 1).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length === 0) throw new BadRequestException('Le fichier ne contient aucune table après les en-têtes.');
  if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`Un fichier ne peut contenir que ${MAX_IMPORT_ROWS} lignes de tables.`);
  if (rows.some((row) => row.slice(headers.length).some((cell) => cell.trim() !== ''))) throw new BadRequestException('Certaines lignes contiennent des colonnes sans en-tête. Corrigez le fichier avant de continuer.');
  const normalizedRows = rows.map((row) => Array.from({ length: headers.length }, (_, index) => row[index] ?? ''));
  if (normalizedRows.some((row) => row.some((cell) => cell.length > MAX_CELL_LENGTH))) throw new BadRequestException(`Chaque cellule doit contenir au maximum ${MAX_CELL_LENGTH} caractères.`);
  return { sheetName, headers, rows: normalizedRows };
}

async function parseXlsx(buffer: Buffer): Promise<ParsedGuestSheet> {
  inspectZip(buffer);
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]); } catch { throw new BadRequestException('Le classeur XLSX est illisible ou endommagé.'); }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new BadRequestException('Le classeur ne contient aucune feuille.');
  if (worksheet.state !== 'visible') throw new BadRequestException('La première feuille Excel doit être visible.');
  const rawRows: string[][] = [];
  let count = 0;
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    count++;
    if (count > MAX_IMPORT_ROWS + 1) throw new BadRequestException(`Un fichier ne peut contenir que ${MAX_IMPORT_ROWS} lignes de tables.`);
    rawRows.push(Array.from({ length: Math.min(row.cellCount, MAX_IMPORT_COLUMNS + 1) }, (_, index) => stringCell(row.getCell(index + 1).value)));
  });
  if (rawRows.some((row) => row.length > MAX_IMPORT_COLUMNS)) throw new BadRequestException(`Le fichier doit contenir au maximum ${MAX_IMPORT_COLUMNS} colonnes.`);
  return normalizeSheet(worksheet.name, rawRows);
}

function parseCsv(buffer: Buffer): ParsedGuestSheet {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { throw new BadRequestException('Le fichier CSV doit être encodé en UTF-8.'); }
  if (text.includes('\0')) throw new BadRequestException('Le fichier CSV contient des caractères binaires interdits.');
  let rawRows: string[][];
  try {
    rawRows = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      delimiter: [',', ';', '\t'],
      max_record_size: 16_384,
      to: MAX_IMPORT_ROWS + 2,
      trim: false,
    }) as string[][];
  } catch {
    throw new BadRequestException('Le fichier CSV est mal formé ou contient une ligne trop longue.');
  }
  if (rawRows.length > MAX_IMPORT_ROWS + 1) throw new BadRequestException(`Un fichier ne peut contenir que ${MAX_IMPORT_ROWS} lignes de tables.`);
  return normalizeSheet('CSV', rawRows);
}

export async function parseGuestFile(fileName: string, mimeType: string, buffer: Buffer): Promise<ParsedGuestSheet> {
  if (buffer.length === 0 || buffer.length > maxImportBytes()) throw new BadRequestException('Le fichier doit peser au maximum 5 Mo.');
  const extension = fileName.toLowerCase().split('.').at(-1);
  if (extension === 'xlsm' || extension === 'xls') throw new BadRequestException('Seuls les fichiers .xlsx et .csv sont acceptés.');
  if (extension === 'xlsx') {
    if (!buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) || !['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream', 'application/zip'].includes(mimeType.toLowerCase())) {
      throw new BadRequestException('Le type ou le contenu de ce fichier XLSX ne correspond pas à son extension.');
    }
    return parseXlsx(buffer);
  }
  if (extension === 'csv') {
    if (!['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel', 'application/octet-stream'].includes(mimeType.toLowerCase())) throw new BadRequestException('Le type MIME du fichier CSV est incorrect.');
    return parseCsv(buffer);
  }
  throw new BadRequestException('Seuls les fichiers .xlsx et .csv sont acceptés.');
}

export function formulaMarker() { return FORMULA_MARKER; }
