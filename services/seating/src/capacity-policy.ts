import { ConflictException } from '@nestjs/common';

export function occupancyAfterAssignment(
  occupied: number,
  existingSeatsOnTarget: number,
  requestedSeats: number,
) {
  if (
    !Number.isSafeInteger(occupied) ||
    occupied < 0 ||
    !Number.isSafeInteger(existingSeatsOnTarget) ||
    existingSeatsOnTarget < 0 ||
    existingSeatsOnTarget > occupied ||
    !Number.isSafeInteger(requestedSeats) ||
    requestedSeats < 1
  ) {
    throw new RangeError('Invalid seating occupancy');
  }
  return occupied - existingSeatsOnTarget + requestedSeats;
}

export function assertCapacity(capacity: number | null, occupied: number) {
  if (capacity !== null && occupied > capacity) {
    throw new ConflictException('La capacité de la table ou de la zone serait dépassée.');
  }
}
