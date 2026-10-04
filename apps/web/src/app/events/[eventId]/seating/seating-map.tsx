'use client';

import type { DragEvent } from 'react';

type Place = {
  id: string;
  name: string;
  number?: number | null;
  capacity: number | null;
  occupied: number;
  overCapacity: boolean;
};

type Assignment = {
  id: string;
  guestId: string;
  tableId: string | null;
  zoneId: string | null;
  seatsReserved: number;
};

type Guest = { id: string; fullName: string; group: { name: string } | null };

export function SeatingMap({
  mode,
  places,
  assignments,
  guests,
  guestNames,
  onAssign,
}: {
  mode: 'TABLE' | 'ZONE';
  places: Place[];
  assignments: Assignment[];
  guests: Guest[];
  guestNames: Map<string, string>;
  onAssign: (guestId: string, targetId: string) => Promise<boolean>;
}) {
  const placedGuestIds = new Set(assignments.map(({ guestId }) => guestId));
  const waitingGuests = guests.filter(({ id }) => !placedGuestIds.has(id));
  const guestById = new Map(guests.map((guest) => [guest.id, guest]));
  const assignmentsByPlace = new Map<string, Assignment[]>();
  for (const assignment of assignments) {
    const placeId = mode === 'TABLE' ? assignment.tableId : assignment.zoneId;
    if (placeId)
      assignmentsByPlace.set(placeId, [...(assignmentsByPlace.get(placeId) ?? []), assignment]);
  }

  function startDrag(event: DragEvent<HTMLElement>, guestId: string) {
    event.dataTransfer.setData('text/plain', guestId);
    event.dataTransfer.effectAllowed = 'move';
  }

  return (
    <section className="seating-map-panel" aria-labelledby="seating-map-title">
      <div className="seating-map-heading">
        <div>
          <p className="eyebrow">VUE DU PLAN</p>
          <h2 id="seating-map-title">{mode === 'TABLE' ? 'Plan des tables' : 'Plan des zones'}</h2>
          <p id="seating-map-help">
            Faites glisser un invité vers sa destination. Le formulaire d’affectation ci-dessous
            reste utilisable au clavier et sur écran tactile.
          </p>
        </div>
        <span>{waitingGuests.length} à placer</span>
      </div>

      <div className="seating-map-layout">
        <aside className="seating-guest-pool" aria-label="Invités autorisés non placés">
          <h3>À placer</h3>
          {waitingGuests.length === 0 ? (
            <p className="seating-muted">
              Aucun invité autorisé non placé ne correspond à la liste affichée.
            </p>
          ) : (
            <ul>
              {waitingGuests.slice(0, 60).map((guest) => (
                <li key={guest.id}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => startDrag(event, guest.id)}
                    aria-describedby="seating-map-help"
                    aria-label={`Faire glisser ${guest.fullName} vers une table ou une zone`}
                  >
                    <strong>{guest.fullName}</strong>
                    {guest.group && <small>{guest.group.name}</small>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {waitingGuests.length > 60 && (
            <p className="seating-muted">
              60 premiers affichés. Filtrez les invités dans le formulaire pour trouver les
              suivants.
            </p>
          )}
        </aside>

        <div
          className="seating-map-board"
          role="region"
          aria-label={
            mode === 'TABLE' ? 'Disposition visuelle des tables' : 'Disposition visuelle des zones'
          }
        >
          {places.length === 0 ? (
            <p className="seating-muted">Créez une destination pour commencer le plan.</p>
          ) : (
            places.map((place) => {
              const seated = assignmentsByPlace.get(place.id) ?? [];
              const fill =
                place.capacity === null
                  ? 0
                  : Math.min(100, Math.round((place.occupied / place.capacity) * 100));
              const remaining = place.capacity === null ? null : Math.max(0, place.capacity - place.occupied);
              return (
                <article
                  className={`seating-map-place ${mode === 'TABLE' ? 'is-table' : 'is-zone'}${place.overCapacity ? ' is-over-capacity' : ''}${remaining === 0 ? ' is-full' : ''}`}
                  key={place.id}
                  aria-describedby="seating-map-help"
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const guestId = event.dataTransfer.getData('text/plain');
                    if (guestId) void onAssign(guestId, place.id);
                  }}
                    aria-label={`${mode === 'TABLE' ? 'Table' : 'Zone'} ${place.name}, ${place.occupied}${place.capacity === null ? ' places occupées, capacité non définie' : ` sur ${place.capacity} places, ${place.overCapacity ? 'capacité dépassée' : `${remaining} places restantes`}`}`}
                >
                  <header>
                    <div>
                      <p>
                        {mode === 'TABLE' && place.number
                          ? `TABLE ${place.number}`
                          : mode === 'TABLE'
                            ? 'TABLE'
                            : 'ZONE'}
                      </p>
                      <h3>{place.name}</h3>
                    </div>
                    <strong>
                      {place.occupied}
                      {place.capacity === null ? '' : ` / ${place.capacity}`}
                    </strong>
                  </header>
                  <p className={`seating-place-capacity${place.overCapacity ? ' over' : ''}`}>{place.capacity === null ? `${place.occupied} place(s) occupée(s) · capacité non définie` : place.overCapacity ? 'Capacité dépassée' : remaining === 0 ? 'Complet' : `${remaining} place(s) restante(s)`}</p>
                  {place.capacity !== null && (
                    <div
                      className="seating-capacity-track"
                      aria-label={`${fill}% de capacité utilisée`}
                    >
                      <span style={{ width: `${fill}%` }} />
                    </div>
                  )}
                  <ul
                    aria-label={`Invités ${mode === 'TABLE' ? 'à la table' : 'dans la zone'} ${place.name}`}
                  >
                    {seated.length === 0 ? (
                      <li className="seating-drop-hint">Déposer un invité ici</li>
                    ) : (
                      seated.map((assignment) => {
                        const guestName =
                          guestNames.get(assignment.guestId) ??
                          guestById.get(assignment.guestId)?.fullName;
                        return (
                          <li key={assignment.id}>
                            <button
                              type="button"
                              draggable
                              onDragStart={(event) => startDrag(event, assignment.guestId)}
                              aria-describedby="seating-map-help"
                              aria-label={`Déplacer ${guestName ?? 'un invité'} vers une autre destination`}
                            >
                              {guestName ?? `Invité ${assignment.guestId.slice(0, 8)}`}
                              <small>{assignment.seatsReserved} place(s)</small>
                            </button>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
