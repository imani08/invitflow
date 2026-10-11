const string = value => typeof value === 'string' ? value : '';
/** An invitation only describes ceremonies explicitly assigned to its guest. */
export function guestCeremonySnapshots(snapshots, access) {
  if (!Array.isArray(snapshots) || !Array.isArray(access)) throw new TypeError('Guest ceremony access is incomplete');
  const invited = new Set(access.filter(entry => entry?.isInvited === true && typeof entry.ceremonyId === 'string').map(entry => entry.ceremonyId));
  return snapshots.filter(entry => invited.has(entry?.ceremony?.id));
}
/** Presentation only: never changes saved instants. Explicit IANA zones keep browser/server aligned. */
export function invitationDisplayFields(event) {
  const timezone = string(event.timezone) || 'Africa/Kinshasa';
  const date = (value, zone) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: zone }).format(new Date(value)) : '';
  const parts = (value, zone) => value && Number.isFinite(Date.parse(value)) ? Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: zone }).formatToParts(new Date(value)).filter(part => ['weekday', 'day', 'month', 'year'].includes(part.type)).map(part => [part.type, part.value.toLocaleUpperCase('fr-FR')])) : {};
  return {
    event: { ...parts(event.startAt, timezone), title: string(event.name), coupleNames: string(event.coupleNames), invitationText: string(event.invitationText), date: event.date ? string(event.date) : date(event.startAt, timezone), venue: string(event.venue) || string(event.venue?.name) || string(event.location) },
    ceremonies: (Array.isArray(event.ceremonies) ? event.ceremonies : []).map(ceremony => {
      const zone = string(ceremony.timezone) || timezone;
      const instant = ceremony.startAt && Number.isFinite(Date.parse(ceremony.startAt)) ? new Date(ceremony.startAt) : null;
      return { ...parts(ceremony.startAt, zone), name: string(ceremony.name) || string(ceremony.title), date: string(ceremony.date) || date(ceremony.startAt, zone), time: string(ceremony.time) || (instant ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(instant) : ''), venue: string(ceremony.venue) || string(ceremony.location), address: string(ceremony.address), reference: string(ceremony.reference), dressCode: string(ceremony.dressCode) };
    }),
  };
}
