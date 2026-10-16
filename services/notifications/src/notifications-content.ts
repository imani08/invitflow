const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NotificationContent = {
  category: string;
  title: string;
  message: string;
  data?: Record<string, string>;
};

function text(value: unknown, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function id(value: unknown) {
  return typeof value === 'string' && uuidPattern.test(value) ? value : '';
}

function date(value: unknown, timezone: string) {
  if (typeof value !== 'string' || !value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: timezone || 'Africa/Kinshasa' }).format(parsed);
  } catch {
    return parsed.toLocaleString('fr-FR');
  }
}

function eventUrl(payload: Record<string, unknown>, suffix = '') {
  const eventId = id(payload['eventId'] ?? payload['id']);
  if (!eventId) return '';
  const agency = id(payload['agencyWorkspaceId']) || text(payload['agencyWorkspaceId'], 80);
  const scope = agency ? '?scope=agency' : '';
  const [path, hash] = suffix.split('#', 2);
  return `/events/${eventId}${path ?? ''}${scope}${hash ? `#${hash}` : ''}`;
}

function action(payload: Record<string, unknown>, suffix: string, label: string) {
  const url = eventUrl(payload, suffix);
  return url ? { actionUrl: url, actionLabel: label } : {};
}

function eventLabel(payload: Record<string, unknown>) {
  return text(payload['name'] ?? payload['eventName']) || 'votre événement';
}

function changedFields(value: unknown) {
  if (!Array.isArray(value)) return '';
  const labels: Record<string, string> = { name: 'nom', description: 'description', startAt: 'date de début', endAt: 'date de fin', timezone: 'fuseau horaire', eventType: 'type', coupleNames: 'noms', invitationText: 'texte d’invitation' };
  return value.filter((field): field is string => typeof field === 'string').map((field) => labels[field] ?? field).slice(0, 6).join(', ');
}

function creditAmount(value: unknown) {
  return Number.isSafeInteger(value) ? Number(value) : 0;
}

function walletData(payload: Record<string, unknown>, extra: Record<string, string> = {}) {
  const data: Record<string, string> = { actionUrl: '/account/wallet', actionLabel: 'Ouvrir le portefeuille', ...extra };
  for (const field of ['walletId', 'entryId', 'referenceId'] as const) {
    const value = payload[field];
    if (typeof value === 'string' && value.length <= 255) data[field] = value;
  }
  return data;
}

export function buildNotificationContent(eventType: string, payload: Record<string, unknown>): NotificationContent | null {
  const name = eventLabel(payload);
  const timezone = text(payload['timezone']) || 'Africa/Kinshasa';
  const eventDate = date(payload['startAt'] ?? payload['targetAt'] ?? payload['eventDate'], timezone);
  const ceremonyName = text(payload['ceremonyName'] ?? payload['name']) || 'ce moment';
  const ceremonyDate = date(payload['ceremonyStartAt'] ?? payload['startAt'] ?? payload['targetAt'], text(payload['ceremonyTimezone']) || timezone);
  const eventData = { ...(eventDate ? { eventDate } : {}), ...(name ? { eventName: name } : {}) };
  const agency = Boolean(payload['agencyWorkspaceId']);
  switch (eventType) {
    case 'agencies.workspace.created.v1':
      return { category: 'agency', title: 'Espace agence créé', message: 'Votre espace agence est prêt. Ajoutez vos clients, choisissez une formule et créez leurs événements depuis l’espace Agence.', data: { actionUrl: '/agencies', actionLabel: 'Ouvrir l’espace Agence' } };
    case 'agencies.quota.reserved.v1': {
      const credits = Number.isSafeInteger(payload['credits']) ? Number(payload['credits']) : 0;
      return { category: 'agency', title: 'Crédits Agence réservés', message: `${credits || 'Des'} crédit${credits === 1 ? '' : 's'} Agence ont été réservés pour une génération. Le portefeuille personnel n’est pas utilisé pour cet événement.`, data: { actionUrl: '/agencies', actionLabel: 'Voir le quota Agence', ...(credits ? { credits: String(credits) } : {}) } };
    }
    case 'agencies.quota.consumed.v1':
      return { category: 'agency', title: 'Quota Agence consommé', message: `${Number(payload['credits']) || 0} crédit(s) Agence ont été consommés après confirmation de l’opération.`, data: { actionUrl: '/agencies', actionLabel: 'Consulter l’usage Agence' } };
    case 'agencies.quota.released.v1':
      return { category: 'agency', title: 'Quota Agence libéré', message: `${Number(payload['credits']) || 0} crédit(s) Agence ont été libérés : aucune dépense personnelle n’a été effectuée.`, data: { actionUrl: '/agencies', actionLabel: 'Consulter l’usage Agence' } };
    case 'events.created.v1':
      return { category: agency ? 'agency' : 'events', title: agency ? 'Événement client créé' : 'Événement créé', message: eventDate ? `« ${name} » a été créé${agency ? ' dans votre agence' : ''}. Date prévue : ${eventDate}. Ajoutez maintenant les moments du programme pour continuer. ` : `« ${name} » a été créé${agency ? ' dans votre agence' : ''}. Ajoutez maintenant les moments du programme pour continuer.`, data: { ...eventData, ...action(payload, '', 'Ouvrir l’événement') } };
    case 'events.updated.v1': {
      const fields = changedFields(payload['changedFields']);
      return { category: agency ? 'agency' : 'events', title: 'Événement mis à jour', message: `Les informations de « ${name} » ont été enregistrées${fields ? ` (${fields})` : ''}. Vérifiez les étapes suivantes avant de publier.`, data: { ...eventData, ...action(payload, '', 'Vérifier l’événement') } };
    }
    case 'events.published.v1':
      return { category: 'events', title: 'Événement publié', message: `« ${name} » est maintenant publié. Vous pouvez finaliser le design, les invités et la génération des invitations.`, data: { ...eventData, ...action(payload, '/designs', 'Continuer la préparation') } };
    case 'events.cancelled.v1':
      return { category: 'events', title: 'Événement annulé', message: `« ${name} » a été annulé. Les invitations, invités et historiques déjà enregistrés restent conservés.`, data: { ...eventData, ...action(payload, '', 'Voir l’événement') } };
    case 'events.completed.v1':
      return { category: 'events', title: 'Événement terminé', message: `« ${name} » est maintenant terminé. Les invitations générées, téléchargements et historiques de pointage restent disponibles.`, data: { ...eventData, ...action(payload, '', 'Consulter l’historique') } };
    case 'events.date.reminder.v1': {
      const kind = payload['reminder'] === 'DAY_OF' ? 'aujourd’hui' : payload['reminder'] === 'ONE_DAY' ? 'demain' : 'dans 7 jours';
      const subject = payload['kind'] === 'CEREMONY' ? `« ${ceremonyName} »` : `« ${name} »`;
      const when = payload['kind'] === 'CEREMONY' ? ceremonyDate : eventDate;
      return { category: 'reminder', title: `Rappel : votre événement a lieu ${kind}`, message: `${subject} aura lieu ${when ? `le ${when}` : kind}. Vérifiez les invités, le programme, les invitations et le pointage avant le jour J.`, data: { ...eventData, ...(when ? { targetDate: when } : {}), ...action(payload, '', 'Ouvrir le parcours') } };
    }
    case 'events.ceremony.created.v1':
      return { category: 'events', title: 'Moment ajouté au programme', message: `${ceremonyName} a été ajouté${ceremonyDate ? ` pour le ${ceremonyDate}` : ''}. Complétez le lieu, les invités et les accès si nécessaire.`, data: { ...eventData, ...(ceremonyDate ? { ceremonyDate } : {}), ...action(payload, `#ceremony-${id(payload['ceremonyId'])}`, 'Ouvrir le programme') } };
    case 'events.ceremony.updated.v1':
      return { category: 'events', title: 'Moment mis à jour', message: `Les informations de ${ceremonyName} ont été enregistrées${ceremonyDate ? ` ; date prévue : ${ceremonyDate}` : ''}.`, data: { ...eventData, ...action(payload, `#ceremony-${id(payload['ceremonyId'])}`, 'Vérifier le moment') } };
    case 'events.ceremony.deleted.v1':
      return { category: 'events', title: 'Moment retiré du programme', message: `Le moment ${ceremonyName} a été retiré. Les autres moments, invités et invitations restent conservés.`, data: { ...eventData, ...action(payload, '', 'Voir le programme') } };
    case 'events.ceremony.program-item.created.v1':
      return { category: 'events', title: 'Étape de programme ajoutée', message: `L’étape « ${text(payload['title']) || 'Nouvelle étape'} » a été ajoutée${date(payload['startsAt'], timezone) ? ` à ${date(payload['startsAt'], timezone)}` : ''}. Le déroulement est enregistré.`, data: { ...eventData, ...action(payload, `#ceremony-${id(payload['ceremonyId'])}`, 'Voir le déroulement') } };
    case 'events.ceremony.program-item.updated.v1':
      return { category: 'events', title: 'Étape de programme mise à jour', message: `L’étape « ${text(payload['title']) || 'du programme'} » a été mise à jour. Vérifiez l’ordre et l’horaire avant publication.`, data: { ...eventData, ...action(payload, `#ceremony-${id(payload['ceremonyId'])}`, 'Vérifier le déroulement') } };
    case 'events.ceremony.program-item.deleted.v1':
      return { category: 'events', title: 'Étape de programme supprimée', message: 'Une étape du déroulement a été supprimée. Le reste du programme reste inchangé.', data: { ...eventData, ...action(payload, `#ceremony-${id(payload['ceremonyId'])}`, 'Voir le déroulement') } };
    case 'events.ceremony.program-reordered.v1':
      return { category: 'events', title: 'Déroulement réorganisé', message: `L’ordre des étapes de ${ceremonyName} a été enregistré. Vérifiez les horaires avant de générer les invitations.`, data: { ...eventData, ...action(payload, `#ceremony-${id(payload['ceremonyId'])}`, 'Vérifier le déroulement') } };
    case 'ai.design.requested.v1':
    case 'ai.design.job-queued.v1':
      return { category: 'design', title: 'Proposition de design en préparation', message: `Votre demande de design pour « ${name} » est enregistrée. La proposition sera disponible dès que le traitement sera terminé.`, data: { ...eventData, ...action(payload, '/designs', 'Suivre la proposition') } };
    case 'ai.design.proposal-ready.v1':
    case 'ai.editorial.proposed.v1':
      return { category: 'design', title: 'Proposition de design disponible', message: `Une proposition de design pour « ${name} » est prête. Prévisualisez-la puis choisissez de l’appliquer ou de la refuser.`, data: { ...eventData, ...action(payload, '/designs', 'Prévisualiser la proposition') } };
    case 'ai.design.job-failed.v1':
    case 'ai.editorial.failed.v1':
      return { category: 'design', title: 'Proposition de design à relancer', message: `La proposition de design pour « ${name} » n’a pas abouti. Vérifiez le détail de l’erreur et relancez-la si nécessaire.`, data: { ...eventData, ...action(payload, '/designs', 'Voir le détail') } };
    case 'ai.design.job-cancelled.v1':
      return { category: 'design', title: 'Demande de design annulée', message: `La demande de proposition de design pour « ${name} » a été annulée. Vos versions existantes restent inchangées.`, data: { ...eventData, ...action(payload, '/designs', 'Retourner aux designs') } };
    case 'ai.design.job-retried.v1':
      return { category: 'design', title: 'Proposition de design relancée', message: `La proposition de design pour « ${name} » a été remise en file de traitement. Vous recevrez une nouvelle notification dès qu’elle sera prête.`, data: { ...eventData, ...action(payload, '/designs', 'Suivre la proposition') } };
    case 'design.created.v1':
      return { category: 'design', title: 'Design créé', message: `Un design a été créé pour « ${name} ». Choisissez-le ou personnalisez-le avant de lancer la génération.`, data: { ...eventData, ...action(payload, '/designs', 'Ouvrir les designs') } };
    case 'design.updated.v1':
      return { category: 'design', title: 'Design enregistré', message: `Les modifications du design de « ${name} » ont été enregistrées. Prévisualisez-le avant validation.`, data: { ...eventData, ...action(payload, '/designs', 'Prévisualiser le design') } };
    case 'design.editorial.selected.v1':
      return { category: 'design', title: 'Design validé', message: `Le design sélectionné pour « ${name} » est prêt pour la génération des invitations.`, data: { ...eventData, ...action(payload, '/invitations', 'Générer les invitations') } };
    case 'design.archived.v1':
      return { category: 'design', title: 'Design archivé', message: `Un design de « ${name} » a été archivé. Vos invitations déjà générées restent disponibles.`, data: { ...eventData, ...action(payload, '/designs', 'Voir les designs') } };
    case 'guest.import.started.v1':
      return { category: 'guests', title: 'Import des invités démarré', message: `L’import de ${Number(payload['rowCount']) || 'vos'} ligne(s) est en cours. Vérifiez le mapping avant validation.`, data: { ...eventData, ...action(payload, '/guests', 'Suivre l’import') } };
    case 'guest.import.validated.v1':
      return { category: 'guests', title: 'Import des invités à valider', message: `${Number(payload['validRows']) || 0} ligne(s) sont valides et ${Number(payload['rejectedRows']) || 0} doivent être corrigées. Validez l’import pour créer les invités.`, data: { ...eventData, ...action(payload, '/guests', 'Valider les invités') } };
    case 'guest.import.expired.v1':
      return { category: 'guests', title: 'Import des invités expiré', message: `L’import préparé pour « ${name} » a expiré après 24 heures sans validation. Les données temporaires ont été supprimées ; relancez un import si nécessaire.`, data: { ...eventData, ...action(payload, '/guests', 'Relancer un import') } };
    case 'guest.import.completed.v1': {
      const imported = Number.isSafeInteger(payload['importedCount']) ? Number(payload['importedCount']) : 0;
      const skipped = Number.isSafeInteger(payload['skippedCount']) ? Number(payload['skippedCount']) : 0;
      return { category: 'guests', title: 'Import des invités terminé', message: `${imported} invité(s) ont été importés${skipped ? ` ; ${skipped} ligne(s) ont été ignorées` : ''}. Vérifiez les accès à chaque moment.`, data: { ...eventData, ...action(payload, '/guests', 'Vérifier les invités') } };
    }
    case 'guest.created.v1': return { category: 'guests', title: 'Invité ajouté', message: `Un invité a été ajouté à « ${name} ». Vérifiez ses moments d’accès et ses accompagnants.`, data: { ...eventData, ...action(payload, '/guests', 'Gérer les invités') } };
    case 'guest.updated.v1': return { category: 'guests', title: 'Invité mis à jour', message: `Les informations d’un invité de « ${name} » ont été enregistrées.`, data: { ...eventData, ...action(payload, '/guests', 'Gérer les invités') } };
    case 'guest.archived.v1': return { category: 'guests', title: 'Invité archivé', message: `Un invité de « ${name} » a été retiré de la liste active.`, data: { ...eventData, ...action(payload, '/guests', 'Gérer les invités') } };
    case 'guest.ceremony-access.updated.v1': return { category: 'guests', title: 'Accès d’un invité mis à jour', message: `Les moments auxquels un invité peut accéder dans « ${name} » ont été modifiés.`, data: { ...eventData, ...action(payload, '/guests', 'Vérifier les accès') } };
    case 'guest.group.updated.v1':
    case 'guest.group.deleted.v1': return { category: 'guests', title: 'Groupe d’invités mis à jour', message: `La liste des groupes d’invités de « ${name} » a été actualisée.`, data: { ...eventData, ...action(payload, '/guests', 'Voir les groupes') } };
    case 'invitation.batch.completed.v1': {
      const count = Number.isSafeInteger(payload['generatedCount']) ? Number(payload['generatedCount']) : 0;
      return { category: 'events', title: 'Invitations générées', message: `${count} invitation(s) de « ${name} » sont prêtes au téléchargement. Vérifiez le rendu et partagez-les aux invités.`, data: { ...eventData, ...action(payload, '/invitations', 'Ouvrir les invitations') } };
    }
    case 'invitation.batch.failed.v1': return { category: 'events', title: 'Génération à vérifier', message: `La génération des invitations de « ${name} » nécessite votre attention. Vérifiez le design, les invités et le quota disponible.`, data: { ...eventData, ...action(payload, '/invitations', 'Résoudre le problème') } };
    case 'invitation.checkin.created.v1': return { category: 'events', title: 'Pointage enregistré', message: `Un invité vient d’être pointé à l’accueil de « ${name} ». Le statut de présence est enregistré dans l’historique.`, data: { ...eventData, ...action(payload, '/check-in', 'Voir le pointage') } };
    case 'seating.plan.updated.v1': return { category: 'events', title: 'Mode de placement enregistré', message: `Le mode de placement de « ${name} » a été enregistré. Ajoutez maintenant les tables ou zones et affectez les invités.`, data: { ...eventData, ...action(payload, '/seating', 'Ouvrir le placement') } };
    case 'seating.table.created.v1':
    case 'seating.table.updated.v1':
    case 'seating.table.deleted.v1':
    case 'seating.zone.created.v1':
    case 'seating.zone.updated.v1':
    case 'seating.zone.deleted.v1': return { category: 'events', title: 'Placement mis à jour', message: `La configuration des tables et zones de « ${name} » a été actualisée. Vérifiez les capacités avant le jour J.`, data: { ...eventData, ...action(payload, '/seating', 'Gérer le placement') } };
    case 'seating.tables.imported.v1': return { category: 'events', title: 'Tables importées', message: `${Number(payload['importedCount']) || 0} table(s) ont été importées pour « ${name} ». Vérifiez les capacités avant d’affecter les invités.`, data: { ...eventData, ...action(payload, '/seating', 'Ouvrir le placement') } };
    case 'seating.assignment.saved.v1': return { category: 'events', title: 'Placement enregistré', message: `Le placement d’un invité pour « ${name} » a été enregistré.`, data: { ...eventData, ...action(payload, '/seating', 'Voir le placement') } };
    case 'seating.assignment.removed.v1': return { category: 'events', title: 'Placement retiré', message: `Une affectation de table a été retirée pour « ${name} ».`, data: { ...eventData, ...action(payload, '/seating', 'Voir le placement') } };
    case 'invitation.rsvp.updated.v1': return { category: 'events', title: 'Réponse reçue', message: `Une réponse à une invitation de « ${name} » vient d’être enregistrée.`, data: { ...eventData, ...action(payload, '/guests', 'Voir les invités') } };
    case 'payment.created.v1': return { category: 'billing', title: 'Paiement en attente', message: `Une commande de votre compte a été créée. Finalisez le paiement pour confirmer les crédits ou la formule.`, data: { actionUrl: '/account/wallet', actionLabel: 'Ouvrir le portefeuille' } };
    case 'payment.succeeded.v1': return { category: 'billing', title: 'Paiement confirmé', message: `Votre paiement a été confirmé${Number.isSafeInteger(payload['credits']) ? ` ; ${Number(payload['credits'])} crédit(s) ont été ajoutés` : ''}. Votre solde et vos droits sont à jour.`, data: { actionUrl: '/account/wallet', actionLabel: 'Voir le portefeuille' } };
    case 'payment.failed.v1': return { category: 'billing', title: 'Paiement refusé', message: 'Le prestataire n’a pas confirmé votre paiement. Aucun droit ne doit être considéré comme acquis ; vous pouvez réessayer depuis votre portefeuille.', data: { actionUrl: '/account/wallet', actionLabel: 'Réessayer le paiement' } };
    case 'payment.refunded.v1': return { category: 'billing', title: 'Paiement remboursé', message: 'Votre remboursement a été confirmé et votre portefeuille a été mis à jour. Vérifiez le nouveau solde et l’historique.', data: { actionUrl: '/account/wallet', actionLabel: 'Voir l’historique' } };
    case 'payment.reconciliation-anomaly.v1': return { category: 'billing', title: 'Paiement à vérifier', message: 'Une anomalie de rapprochement a été détectée. Aucun crédit supplémentaire ne sera considéré comme disponible avant résolution.', data: { actionUrl: '/account/wallet', actionLabel: 'Consulter le paiement' } };
    case 'payment.reconciliation-resolved.v1': return { category: 'billing', title: 'Paiement vérifié', message: 'Une anomalie de paiement a été résolue. Votre historique et vos droits ont été recalculés.', data: { actionUrl: '/account/wallet', actionLabel: 'Vérifier le portefeuille' } };
    case 'wallet.credited.v1':
    case 'wallet.promo-credited.v1':
    case 'wallet.adjusted.v1': {
      const credits = creditAmount(payload['availableDelta']);
      const kind = eventType === 'wallet.promo-credited.v1' ? 'promotionnels' : eventType === 'wallet.adjusted.v1' ? 'ajustés par l’administration' : 'achetés';
      return { category: 'billing', title: 'Portefeuille mis à jour', message: `${credits} crédit(s) ${kind} ont été ajoutés à votre portefeuille. Vérifiez le solde et la référence de l’opération.`, data: walletData(payload, { actionLabel: 'Voir le portefeuille', ...(credits ? { credits: String(credits) } : {}) }) };
    }
    case 'credits.reserved.v1': {
      const credits = Math.abs(creditAmount(payload['reservedDelta']) || creditAmount(payload['availableDelta']));
      return { category: 'billing', title: 'Crédits réservés', message: `${credits} crédit(s) ont été réservés pour une opération en cours. Ils ne sont plus disponibles pour une autre génération tant que cette opération n’est pas finalisée.`, data: walletData(payload, { actionLabel: 'Vérifier la réservation', ...(credits ? { credits: String(credits) } : {}) }) };
    }
    case 'credits.consumed.v1': {
      const credits = Math.abs(creditAmount(payload['reservedDelta']) || creditAmount(payload['availableDelta']));
      return { category: 'billing', title: 'Crédits consommés', message: `${credits} crédit(s) ont été consommés après confirmation de l’opération. Le solde de votre portefeuille a été mis à jour.`, data: walletData(payload, { actionLabel: 'Voir le solde', ...(credits ? { credits: String(credits) } : {}) }) };
    }
    case 'credits.released.v1':
    case 'credits.release-confirmed-without-reservation.v1': {
      const credits = Math.abs(creditAmount(payload['releasedCredits']) || creditAmount(payload['availableDelta']));
      return { category: 'billing', title: 'Crédits libérés', message: `${credits} crédit(s) ont été libérés et sont de nouveau disponibles dans votre portefeuille.`, data: walletData(payload, { actionLabel: 'Voir le solde', ...(credits ? { credits: String(credits) } : {}) }) };
    }
    case 'credits.settled.v1': {
      const released = Math.max(0, creditAmount(payload['availableDelta']));
      const consumed = Math.max(0, creditAmount(payload['reservedDelta']) * -1 - released);
      return { category: 'billing', title: 'Réservation de crédits réglée', message: `La réservation a été réglée : ${consumed} crédit(s) consommés${released ? ` et ${released} crédit(s) libérés` : ''}. Le solde est à jour.`, data: walletData(payload, { actionLabel: 'Voir le détail' }) };
    }
    case 'wallet.reversed.v1':
      return { category: 'billing', title: 'Opération portefeuille annulée', message: 'Une opération de crédit a été annulée et le solde de votre portefeuille a été corrigé. Consultez la référence et l’historique.', data: walletData(payload, { actionLabel: 'Consulter l’historique' }) };
    case 'profile.updated.v1': {
      const fields = changedFields(payload['changedFields']);
      return { category: 'account', title: 'Profil enregistré', message: `Les informations de votre profil ont été enregistrées${fields ? ` (${fields})` : ''}. Vérifiez votre identité et vos préférences avant de poursuivre.`, data: { actionUrl: '/account', actionLabel: 'Ouvrir mon compte' } };
    }
    case 'profile.account_deletion.requested.v1': return { category: 'account', title: 'Demande de suppression enregistrée', message: 'Votre demande de suppression de compte a été enregistrée. Vous pouvez encore l’annuler depuis les paramètres tant qu’elle est en attente.', data: { actionUrl: '/account', actionLabel: 'Gérer mon compte' } };
    case 'profile.account_deletion.cancelled.v1': return { category: 'account', title: 'Suppression du compte annulée', message: 'La demande de suppression de votre compte a été annulée. Votre espace reste actif.', data: { actionUrl: '/account', actionLabel: 'Ouvrir mon compte' } };
    case 'access.agent.assigned.v1': return { category: 'agency', title: 'Accès de pointage accordé', message: `Un accès sécurisé de pointage a été attribué à un agent pour « ${name} ». Le lien partageable reste indépendant des comptes personnels.`, data: { ...eventData, ...action(payload, '/check-in', 'Gérer le pointage') } };
    case 'access.agent.revoked.v1':
    case 'access.agent.ceremony-revoked.v1': return { category: 'agency', title: 'Accès de pointage révoqué', message: `Un accès de pointage a été révoqué pour « ${name} ». Les pointages déjà enregistrés restent conservés.`, data: { ...eventData, ...action(payload, '/check-in', 'Gérer le pointage') } };
    default: return null;
  }
}
