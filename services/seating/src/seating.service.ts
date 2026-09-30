import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SeatingMode } from '../generated/prisma/client.js';
import { EventsClient } from './events-client.js';
import { GuestsClient } from './guests-client.js';
import { formulaMarker, parseGuestFile } from './table-import.parser.js';
import { maxImportBytes } from './env.js';
import { PrismaService } from './prisma.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Target = { tableId?: string; zoneId?: string };
type TableImportRow = { rowNumber: number; name: string; number: number | null; capacity: number | null; category: string | null; notes: string | null; errors: string[] };
const modes = new Set<string>(Object.values(SeatingMode));

function identifier(value: string, label: string) {
  if (!UUID.test(value)) throw new NotFoundException(`${label} not found`);
  return value;
}

function record(value: unknown, allowed: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Corps de requête invalide.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key))) throw new BadRequestException('Champs non autorisés dans la requête.');
  return result;
}

function text(value: unknown, field: string, max: number, required = false): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null && !required) return null;
  if (typeof value !== 'string') throw new BadRequestException(`${field} doit être du texte.`);
  const trimmed = value.trim();
  if ((required && (trimmed.length < 1 || trimmed.length > max)) || trimmed.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) throw new BadRequestException(`${field} est invalide.`);
  return trimmed;
}

function positiveInteger(value: unknown, field: string, maximum: number, nullable = false): number | null | undefined {
  if (value === undefined) return undefined;
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maximum) throw new BadRequestException(`${field} doit être un entier entre 1 et ${maximum}.`);
  return value;
}

@Injectable()
export class SeatingService {
  constructor(private readonly prisma: PrismaService, private readonly events: EventsClient, private readonly guests: GuestsClient) {}

  private async context(ownerSubject: string, eventId: string, ceremonyId: string, authorization: string) {
    identifier(eventId, 'Event'); identifier(ceremonyId, 'Ceremony');
    await this.events.assertCeremony(eventId, ceremonyId, authorization);
  }

  private async plan(ownerSubject: string, eventId: string, ceremonyId: string, create = false) {
    const existing = await this.prisma.seatingPlan.findFirst({ where: { ownerSubject, eventId, ceremonyId } });
    if (existing || !create) return existing;
    return this.prisma.seatingPlan.create({ data: { ownerSubject, eventId, ceremonyId } });
  }

  async getPlan(ownerSubject: string, eventId: string, ceremonyId: string, authorization: string) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization);
    const plan = await this.plan(ownerSubject, eventId, ceremonyId);
    if (!plan) return { ceremonyId, mode: SeatingMode.NO_SEATING, tables: [], zones: [], assignments: [] };
    const [tables, zones, assignments] = await Promise.all([
      this.prisma.seatingTable.findMany({ where: { ownerSubject, eventId, ceremonyId }, orderBy: [{ number: 'asc' }, { name: 'asc' }] }),
      this.prisma.seatingZone.findMany({ where: { ownerSubject, eventId, ceremonyId }, orderBy: { name: 'asc' } }),
      this.prisma.seatingAssignment.findMany({ where: { ownerSubject, eventId, ceremonyId }, orderBy: { createdAt: 'asc' } }),
    ]);
    const tableOccupancy = new Map<string, number>();
    const zoneOccupancy = new Map<string, number>();
    for (const assignment of assignments) {
      if (assignment.tableId) tableOccupancy.set(assignment.tableId, (tableOccupancy.get(assignment.tableId) ?? 0) + assignment.seatsReserved);
      if (assignment.zoneId) zoneOccupancy.set(assignment.zoneId, (zoneOccupancy.get(assignment.zoneId) ?? 0) + assignment.seatsReserved);
    }
    return {
      ceremonyId, mode: plan.mode,
      tables: tables.map((table) => ({ ...table, occupied: tableOccupancy.get(table.id) ?? 0, overCapacity: (tableOccupancy.get(table.id) ?? 0) > table.capacity })),
      zones: zones.map((zone) => ({ ...zone, occupied: zoneOccupancy.get(zone.id) ?? 0, overCapacity: zone.capacity !== null && (zoneOccupancy.get(zone.id) ?? 0) > zone.capacity })),
      assignments,
    };
  }

  async setMode(ownerSubject: string, eventId: string, ceremonyId: string, authorization: string, input: unknown) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization);
    const body = record(input, ['mode']);
    if (typeof body['mode'] !== 'string' || !modes.has(body['mode'])) throw new BadRequestException('Mode de placement invalide.');
    const mode = body['mode'] as SeatingMode;
    const existing = await this.plan(ownerSubject, eventId, ceremonyId);
    if (existing && existing.mode !== mode) {
      const [tables, zones, assignments] = await Promise.all([
        this.prisma.seatingTable.count({ where: { ownerSubject, eventId, ceremonyId } }),
        this.prisma.seatingZone.count({ where: { ownerSubject, eventId, ceremonyId } }),
        this.prisma.seatingAssignment.count({ where: { ownerSubject, eventId, ceremonyId } }),
      ]);
      if (tables || zones || assignments) throw new ConflictException('Supprimez les tables, zones et affectations avant de changer le mode.');
    }
    return this.writeEvent('seating.plan.updated.v1', ceremonyId, { eventId, ceremonyId, mode }, (tx) => tx.seatingPlan.upsert({
      where: { ceremonyId }, create: { ownerSubject, eventId, ceremonyId, mode }, update: { mode },
    }));
  }

  async listTables(ownerSubject: string, eventId: string, ceremonyId: string, authorization: string) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization);
    const result = await this.getPlanData(ownerSubject, eventId, ceremonyId, 'TABLE');
    return result;
  }

  private async getPlanData(ownerSubject: string, eventId: string, ceremonyId: string, expected: 'TABLE' | 'ZONE') {
    const plan = await this.plan(ownerSubject, eventId, ceremonyId);
    if (plan?.mode !== expected) throw new ConflictException(`Le mode de placement doit être ${expected}.`);
    const rows = expected === 'TABLE'
      ? await this.prisma.seatingTable.findMany({ where: { ownerSubject, eventId, ceremonyId }, orderBy: [{ number: 'asc' }, { name: 'asc' }] })
      : await this.prisma.seatingZone.findMany({ where: { ownerSubject, eventId, ceremonyId }, orderBy: { name: 'asc' } });
    const assignments = await this.prisma.seatingAssignment.findMany({ where: { ownerSubject, eventId, ceremonyId }, select: { tableId: true, zoneId: true, seatsReserved: true } });
    const occupancy = new Map<string, number>();
    for (const assignment of assignments) {
      const targetId = expected === 'TABLE' ? assignment.tableId : assignment.zoneId;
      if (targetId) occupancy.set(targetId, (occupancy.get(targetId) ?? 0) + assignment.seatsReserved);
    }
    return rows.map((row) => {
      const occupied = occupancy.get(row.id) ?? 0;
      return { ...row, occupied, overCapacity: row.capacity !== null && occupied > row.capacity };
    });
  }

  async createTable(ownerSubject: string, eventId: string, ceremonyId: string, authorization: string, input: unknown) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization);
    await this.requireMode(ownerSubject, eventId, ceremonyId, 'TABLE');
    const data = this.tableInput(input, false);
    try { return await this.writeEvent<{ id: string; number: number | null; capacity: number }>('seating.table.created.v1', (table) => table.id, (table) => ({ eventId, ceremonyId, tableId: table.id, number: table.number, capacity: table.capacity }), (tx) => tx.seatingTable.create({ data: { ownerSubject, eventId, ceremonyId, name: data.name!, capacity: data.capacity!, number: data.number ?? null, category: data.category ?? null, notes: data.notes ?? null } })); }
    catch (error) { this.uniqueConflict(error); throw error; }
  }

  async updateTable(ownerSubject: string, eventId: string, ceremonyId: string, tableId: string, authorization: string, input: unknown) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization); identifier(tableId, 'Table');
    await this.requireMode(ownerSubject, eventId, ceremonyId, 'TABLE');
    const data = this.tableInput(input, true);
    const existing = await this.prisma.seatingTable.findFirst({ where: { id: tableId, ownerSubject, eventId, ceremonyId } });
    if (!existing) throw new NotFoundException('Table not found');
    try { return await this.writeEvent('seating.table.updated.v1', ceremonyId, { eventId, ceremonyId, tableId, changedFields: Object.keys(data) }, (tx) => tx.seatingTable.update({ where: { id: tableId }, data })); }
    catch (error) { this.uniqueConflict(error); throw error; }
  }

  async deleteTable(ownerSubject: string, eventId: string, ceremonyId: string, tableId: string, authorization: string) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization); identifier(tableId, 'Table');
    const table = await this.prisma.seatingTable.findFirst({ where: { id: tableId, ownerSubject, eventId, ceremonyId } });
    if (!table) throw new NotFoundException('Table not found');
    await this.writeEvent('seating.table.deleted.v1', ceremonyId, { eventId, ceremonyId, tableId }, (tx) => tx.seatingTable.delete({ where: { id: tableId } }));
    return { deleted: true };
  }

  async listZones(ownerSubject: string, eventId: string, ceremonyId: string, authorization: string) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization);
    return this.getPlanData(ownerSubject, eventId, ceremonyId, 'ZONE');
  }

  async createZone(ownerSubject: string, eventId: string, ceremonyId: string, authorization: string, input: unknown) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization);
    await this.requireMode(ownerSubject, eventId, ceremonyId, 'ZONE');
    const data = this.zoneInput(input, false);
    try { return await this.writeEvent<{ id: string; capacity: number | null }>('seating.zone.created.v1', (zone) => zone.id, (zone) => ({ eventId, ceremonyId, zoneId: zone.id, capacity: zone.capacity }), (tx) => tx.seatingZone.create({ data: { ownerSubject, eventId, ceremonyId, name: data.name!, capacity: data.capacity ?? null, category: data.category ?? null, notes: data.notes ?? null } })); }
    catch (error) { this.uniqueConflict(error); throw error; }
  }

  async updateZone(ownerSubject: string, eventId: string, ceremonyId: string, zoneId: string, authorization: string, input: unknown) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization); identifier(zoneId, 'Zone');
    await this.requireMode(ownerSubject, eventId, ceremonyId, 'ZONE');
    const data = this.zoneInput(input, true);
    const existing = await this.prisma.seatingZone.findFirst({ where: { id: zoneId, ownerSubject, eventId, ceremonyId } });
    if (!existing) throw new NotFoundException('Zone not found');
    try { return await this.writeEvent('seating.zone.updated.v1', ceremonyId, { eventId, ceremonyId, zoneId, changedFields: Object.keys(data) }, (tx) => tx.seatingZone.update({ where: { id: zoneId }, data })); }
    catch (error) { this.uniqueConflict(error); throw error; }
  }

  async deleteZone(ownerSubject: string, eventId: string, ceremonyId: string, zoneId: string, authorization: string) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization); identifier(zoneId, 'Zone');
    const zone = await this.prisma.seatingZone.findFirst({ where: { id: zoneId, ownerSubject, eventId, ceremonyId } });
    if (!zone) throw new NotFoundException('Zone not found');
    await this.writeEvent('seating.zone.deleted.v1', ceremonyId, { eventId, ceremonyId, zoneId }, (tx) => tx.seatingZone.delete({ where: { id: zoneId } }));
    return { deleted: true };
  }

  async listAssignments(ownerSubject: string, eventId: string, ceremonyId: string, authorization: string) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization);
    return this.prisma.seatingAssignment.findMany({ where: { ownerSubject, eventId, ceremonyId }, orderBy: { createdAt: 'asc' } });
  }

  async analyzeTableImport(ownerSubject: string, eventId: string, ceremonyId: string, authorization: string, fileName: string, mimeType: string, buffer: Buffer) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization);
    await this.requireMode(ownerSubject, eventId, ceremonyId, 'TABLE');
    if (buffer.length < 1 || buffer.length > maxImportBytes()) throw new BadRequestException('Le fichier doit peser au maximum 5 Mo.');
    const sheet = await parseGuestFile(fileName, mimeType, buffer);
    const normalized = sheet.headers.map((header) => header.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, ' '));
    const find = (names: string[]) => normalized.findIndex((header) => names.includes(header));
    const nameColumn = find(['table', 'table name', 'name', 'nom', 'nom de table']);
    const capacityColumn = find(['capacity', 'capacite', 'places', 'nombre de places', 'seats']);
    const numberColumn = find(['number', 'numero', 'numero de table', 'table number', 'no']);
    const categoryColumn = find(['category', 'categorie', 'type']);
    const notesColumn = find(['notes', 'note', 'commentaire', 'comments']);
    if (nameColumn < 0 || capacityColumn < 0) throw new BadRequestException('Le fichier doit contenir une colonne « nom de table » et une colonne « capacité ».');
    const marker = formulaMarker();
    const rows: TableImportRow[] = sheet.rows.map((row, index) => {
      const read = (column: number) => row[column]?.trim() ?? '';
      const name = read(nameColumn);
      const rawCapacity = read(capacityColumn);
      const rawNumber = numberColumn < 0 ? '' : read(numberColumn);
      const category = categoryColumn < 0 ? '' : read(categoryColumn);
      const notes = notesColumn < 0 ? '' : read(notesColumn);
      const errors: string[] = [];
      if ([name, rawCapacity, rawNumber, category, notes].some((value) => value.includes(marker))) errors.push('Formule de tableur interdite.');
      if (/^[\u0000-\u0020]*[=+@-]/.test(name) || /^[\u0000-\u0020]*[=+@]/.test(category) || /^[\u0000-\u0020]*[=+@]/.test(notes)) errors.push('Valeur de tableur à risque.');
      if (/^[\u0000-\u0020]*[=+@]/.test(rawCapacity) || /^[\u0000-\u0020]*[=+@]/.test(rawNumber)) errors.push('Valeur de tableur à risque.');
      if ([name, category, notes].some((value) => /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value))) errors.push('Caractère interdit dans une cellule.');
      if (name.length < 1 || name.length > 100) errors.push('Le nom de table doit contenir de 1 à 100 caractères.');
      const capacity = rawCapacity ? Number(rawCapacity) : NaN;
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) errors.push('La capacité doit être un entier entre 1 et 500.');
      const parsedNumber = rawNumber ? Number(rawNumber) : null;
      if (rawNumber && (typeof parsedNumber !== 'number' || !Number.isInteger(parsedNumber) || parsedNumber < 1 || parsedNumber > 10000)) errors.push('Le numéro doit être un entier entre 1 et 10 000.');
      const number = typeof parsedNumber === 'number' && Number.isInteger(parsedNumber) ? parsedNumber : null;
      if (category.length > 80 || notes.length > 1000) errors.push('La catégorie ou les notes dépassent la longueur autorisée.');
      return { rowNumber: index + 2, name, number, capacity: Number.isFinite(capacity) ? capacity : null, category: category || null, notes: notes || null, errors };
    });
    const seenNames = new Set<string>(); const seenNumbers = new Set<number>();
    for (const row of rows) {
      const nameKey = row.name.toLocaleLowerCase('fr');
      if (nameKey && seenNames.has(nameKey)) row.errors.push('Nom de table en double dans le fichier.');
      if (nameKey) seenNames.add(nameKey);
      if (row.number !== null && seenNumbers.has(row.number)) row.errors.push('Numéro de table en double dans le fichier.');
      if (row.number !== null) seenNumbers.add(row.number);
    }
    const existingTables = await this.prisma.seatingTable.findMany({ where: { ownerSubject, eventId, ceremonyId }, select: { name: true, number: true } });
    const existingNames = new Set(existingTables.map((table) => table.name.toLocaleLowerCase('fr')));
    const existingNumbers = new Set(existingTables.flatMap((table) => table.number === null ? [] : [table.number]));
    for (const row of rows) {
      if (existingNames.has(row.name.toLocaleLowerCase('fr'))) row.errors.push('Ce nom est déjà utilisé dans cette cérémonie.');
      if (row.number !== null && existingNumbers.has(row.number)) row.errors.push('Ce numéro est déjà utilisé dans cette cérémonie.');
    }
    const originalName = fileName.replace(/[\\/\x00-\x1f]/g, '_').slice(-255) || 'tables.csv';
    const validCount = rows.filter((row) => row.errors.length === 0).length;
    await this.prisma.seatingImportJob.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
    const job = await this.prisma.seatingImportJob.create({ data: {
      ownerSubject, eventId, ceremonyId, originalName,
      sourceRows: rows as unknown as Prisma.InputJsonValue,
      preview: rows as unknown as Prisma.InputJsonValue,
    } });
    return { id: job.id, originalName, rowCount: rows.length, validCount, invalidCount: rows.length - validCount, preview: rows };
  }

  async getTableImport(ownerSubject: string, eventId: string, ceremonyId: string, jobId: string, authorization: string) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization); identifier(jobId, 'Import');
    const job = await this.prisma.seatingImportJob.findFirst({ where: { id: jobId, ownerSubject, eventId, ceremonyId } });
    if (!job) throw new NotFoundException('Import not found');
    if (job.createdAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      await this.prisma.seatingImportJob.deleteMany({ where: { id: jobId, ownerSubject } });
      throw new NotFoundException('Import expired');
    }
    const preview = job.preview as unknown as TableImportRow[];
    return { id: job.id, originalName: job.originalName, status: job.status, rowCount: preview.length, validCount: preview.filter((row) => row.errors.length === 0).length, invalidCount: preview.filter((row) => row.errors.length > 0).length, preview, resultSummary: job.resultSummary };
  }

  async commitTableImport(ownerSubject: string, eventId: string, ceremonyId: string, jobId: string, authorization: string) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization); identifier(jobId, 'Import');
    await this.requireMode(ownerSubject, eventId, ceremonyId, 'TABLE');
    const job = await this.prisma.seatingImportJob.findFirst({ where: { id: jobId, ownerSubject, eventId, ceremonyId } });
    if (!job) throw new NotFoundException('Import not found');
    if (job.createdAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      await this.prisma.seatingImportJob.deleteMany({ where: { id: jobId, ownerSubject } });
      throw new NotFoundException('Import expired');
    }
    if (job.status === 'COMPLETED') return job.resultSummary;
    const rows = job.sourceRows as unknown as TableImportRow[];
    if (!rows.length || rows.some((row) => row.errors.length)) throw new ConflictException('Corrigez les lignes invalides et importez à nouveau le fichier.');
    const summary = { importedCount: rows.length };
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.seatingTable.createMany({ data: rows.map(({ name, number, capacity, category, notes }) => ({ ownerSubject, eventId, ceremonyId, name, number, capacity: capacity!, category, notes })) });
        await tx.seatingImportJob.update({ where: { id: jobId }, data: { status: 'COMPLETED', resultSummary: summary } });
        await tx.outboxMessage.create({ data: { eventType: 'seating.tables.imported.v1', aggregateId: ceremonyId, payload: { eventId, ceremonyId, importId: jobId, importedCount: rows.length } } });
        return summary;
      }, { maxWait: 5_000, timeout: 15_000 });
    } catch (error) { this.uniqueConflict(error); throw error; }
  }

  async assign(ownerSubject: string, eventId: string, ceremonyId: string, authorization: string, input: unknown) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization);
    const body = record(input, ['guestId', 'tableId', 'zoneId']);
    if (typeof body['guestId'] !== 'string') throw new BadRequestException('guestId est obligatoire.');
    const guestId = identifier(body['guestId'], 'Guest');
    const tableId = body['tableId'] === undefined || body['tableId'] === null ? undefined : typeof body['tableId'] === 'string' ? identifier(body['tableId'], 'Table') : (() => { throw new BadRequestException('tableId invalide.'); })();
    const zoneId = body['zoneId'] === undefined || body['zoneId'] === null ? undefined : typeof body['zoneId'] === 'string' ? identifier(body['zoneId'], 'Zone') : (() => { throw new BadRequestException('zoneId invalide.'); })();
    if (Boolean(tableId) === Boolean(zoneId)) throw new BadRequestException('Choisissez exactement une table ou une zone.');
    const plan = await this.plan(ownerSubject, eventId, ceremonyId);
    if (!plan) throw new ConflictException('Définissez d’abord le mode de placement.');
    if (plan.mode === SeatingMode.TABLE && (!tableId || zoneId) || plan.mode === SeatingMode.ZONE && (!zoneId || tableId) || plan.mode === SeatingMode.NO_SEATING) throw new ConflictException('La cible ne correspond pas au mode de placement choisi.');
    const seatsReserved = await this.guests.reservedSeats(eventId, ceremonyId, guestId, authorization);
    let target: Target;
    let capacity: number | null;
    if (tableId) {
      const table = await this.prisma.seatingTable.findFirst({ where: { id: tableId, ownerSubject, eventId, ceremonyId } });
      if (!table) throw new NotFoundException('Table not found');
      target = { tableId }; capacity = table.capacity;
    } else {
      const zone = await this.prisma.seatingZone.findFirst({ where: { id: zoneId!, ownerSubject, eventId, ceremonyId } });
      if (!zone) throw new NotFoundException('Zone not found');
      target = { zoneId: zone.id }; capacity = zone.capacity;
    }
    const assignment = await this.writeEvent('seating.assignment.saved.v1', guestId, { eventId, ceremonyId, guestId, tableId: tableId ?? null, zoneId: zoneId ?? null, seatsReserved }, (tx) => tx.seatingAssignment.upsert({
      where: { ceremonyId_guestId: { ceremonyId, guestId } },
      create: { ownerSubject, eventId, ceremonyId, guestId, ...target, seatsReserved },
      update: { ...target, seatsReserved },
    }));
    const occupancy = tableId
      ? await this.prisma.seatingAssignment.aggregate({ where: { ownerSubject, eventId, ceremonyId, tableId }, _sum: { seatsReserved: true } })
      : await this.prisma.seatingAssignment.aggregate({ where: { ownerSubject, eventId, ceremonyId, zoneId }, _sum: { seatsReserved: true } });
    const occupiedAfter = occupancy._sum.seatsReserved ?? 0;
    return { ...assignment, occupied: occupiedAfter, capacity, overCapacity: capacity !== null && occupiedAfter > capacity };
  }

  async unassign(ownerSubject: string, eventId: string, ceremonyId: string, guestId: string, authorization: string) {
    await this.context(ownerSubject, eventId, ceremonyId, authorization); identifier(guestId, 'Guest');
    const existing = await this.prisma.seatingAssignment.findFirst({ where: { ownerSubject, eventId, ceremonyId, guestId } });
    if (!existing) throw new NotFoundException('Assignment not found');
    await this.writeEvent('seating.assignment.removed.v1', guestId, { eventId, ceremonyId, guestId }, (tx) => tx.seatingAssignment.delete({ where: { id: existing.id } }));
    return { deleted: true };
  }

  private async requireMode(ownerSubject: string, eventId: string, ceremonyId: string, expected: 'TABLE' | 'ZONE') {
    const plan = await this.plan(ownerSubject, eventId, ceremonyId);
    if (plan?.mode !== expected) throw new ConflictException(`Le mode de placement doit être ${expected}.`);
  }

  private async writeEvent<T>(eventType: string, aggregateId: string | ((result: T) => string), payload: Prisma.InputJsonValue | ((result: T) => Prisma.InputJsonValue), operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const result = await operation(tx);
      await tx.outboxMessage.create({ data: { eventType, aggregateId: typeof aggregateId === 'function' ? aggregateId(result) : aggregateId, payload: typeof payload === 'function' ? payload(result) : payload } });
      return result;
    });
  }

  private tableInput(value: unknown, partial: boolean) {
    const body = record(value, ['name', 'number', 'capacity', 'category', 'notes']);
    if (!partial && (body['name'] === undefined || body['capacity'] === undefined)) throw new BadRequestException('Le nom et la capacité sont obligatoires.');
    const name = text(body['name'], 'Nom de table', 100, !partial);
    const number = positiveInteger(body['number'], 'Numéro', 10000, true);
    const capacity = positiveInteger(body['capacity'], 'Capacité', 500);
    const category = text(body['category'], 'Catégorie', 80);
    const notes = text(body['notes'], 'Notes', 1000);
    return { ...(name !== undefined ? { name } : {}), ...(number !== undefined ? { number } : {}), ...(capacity !== undefined ? { capacity } : {}), ...(category !== undefined ? { category } : {}), ...(notes !== undefined ? { notes } : {}) };
  }

  private zoneInput(value: unknown, partial: boolean) {
    const body = record(value, ['name', 'capacity', 'category', 'notes']);
    if (!partial && body['name'] === undefined) throw new BadRequestException('Le nom de zone est obligatoire.');
    const name = text(body['name'], 'Nom de zone', 100, !partial);
    const capacity = positiveInteger(body['capacity'], 'Capacité', 500, true);
    const category = text(body['category'], 'Catégorie', 80);
    const notes = text(body['notes'], 'Notes', 1000);
    return { ...(name !== undefined ? { name } : {}), ...(capacity !== undefined ? { capacity } : {}), ...(category !== undefined ? { category } : {}), ...(notes !== undefined ? { notes } : {}) };
  }

  private uniqueConflict(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Ce nom ou numéro est déjà utilisé pour cette cérémonie.');
  }
}
