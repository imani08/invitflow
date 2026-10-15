import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { CheckInLicenseSource, CheckInLicenseStatus } from '../generated/prisma/client.js';
import { EventsClient } from './events-client.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class CheckInLicenseService {
  constructor(private readonly prisma: PrismaService, private readonly events: EventsClient) {}

  async list(ownerSubject: string) {
    const rows = await this.prisma.checkInLicense.findMany({ where: { ownerSubject }, orderBy: { createdAt: 'desc' } });
    return { items: rows.map((row) => ({ id: row.id, source: row.source, status: row.status, eventId: row.eventId, guestCapacity: row.guestCapacity, usedGuestCount: row.usedGuestCount, createdAt: row.createdAt, assignedAt: row.assignedAt })) };
  }

  async createPersonalLicenses(ownerSubject: string, paymentId: string, events: number, guestCapacity: number) {
    if (!Number.isSafeInteger(events) || !Number.isSafeInteger(guestCapacity) || events < 1 || guestCapacity < 1) return;
    await this.prisma.$transaction(async (tx) => {
      for (let index = 0; index < events; index += 1) await tx.checkInLicense.upsert({
        where: { sourceReference: `payment:${paymentId}:checkin:${index + 1}` },
        create: { source: CheckInLicenseSource.PERSONAL, status: CheckInLicenseStatus.UNASSIGNED, ownerSubject, sourceReference: `payment:${paymentId}:checkin:${index + 1}`, guestCapacity }, update: {},
      });
    });
  }

  async entitlementForEvent(ownerSubject: string, eventId: string, authorization: string) {
    const event = await this.events.assertManageableCeremonies(eventId, [], authorization);
    const agencyWorkspaceId = typeof event['agencyWorkspaceId'] === 'string' ? event['agencyWorkspaceId'] : null;
    if (!agencyWorkspaceId) {
      if (event['ownerSubject'] !== ownerSubject) throw new ForbiddenException('L’événement personnel ne correspond pas au titulaire du droit de pointage.');
      const assigned = await this.prisma.checkInLicense.findFirst({ where: { source: CheckInLicenseSource.PERSONAL, ownerSubject, eventId, status: CheckInLicenseStatus.ACTIVE } });
      if (assigned) return assigned;
      const license = await this.prisma.checkInLicense.findFirst({ where: { source: CheckInLicenseSource.PERSONAL, ownerSubject, status: CheckInLicenseStatus.UNASSIGNED }, orderBy: { createdAt: 'asc' } });
      if (!license) throw new ForbiddenException('Aucun droit de pointage personnel non affecté n’est disponible.');
      return this.prisma.checkInLicense.update({ where: { id: license.id }, data: { eventId, status: CheckInLicenseStatus.ACTIVE, assignedAt: new Date() } });
    }
    const agency = await this.events.agencyCheckInEntitlement(eventId);
    if (!agency || typeof agency['id'] !== 'string' || typeof agency['guestCapacity'] !== 'number' || agency['guestCapacity'] < 1) throw new ForbiddenException('Le pointage n’est pas activé pour cet événement d’agence.');
    return this.prisma.checkInLicense.upsert({ where: { sourceReference: `agency:${agency['id']}` }, create: { source: CheckInLicenseSource.AGENCY, status: CheckInLicenseStatus.ACTIVE, ownerSubject, sourceReference: `agency:${agency['id']}`, eventId, guestCapacity: agency['guestCapacity'], assignedAt: new Date() }, update: { ownerSubject, eventId, status: CheckInLicenseStatus.ACTIVE } });
  }

  async ensureActive(licenseId: string | null) {
    if (!licenseId) throw new ForbiddenException('Ce lien de pointage ne possède pas de droit actif.');
    const license = await this.prisma.checkInLicense.findFirst({ where: { id: licenseId, status: CheckInLicenseStatus.ACTIVE } });
    if (!license) throw new ForbiddenException('Le droit de pointage de ce lien n’est plus actif.');
    return license;
  }
}
