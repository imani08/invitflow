export function resolveGuestPreviewValues(variables, guest, context = {}) {
  return Object.fromEntries(variables.map((variable) => {
    const identity = `${variable.key} ${variable.label}`;
    const isGuestName = /guest|invite|invité|invitee/i.test(identity) && /name|nom/i.test(identity);
    const isTableName = /table/i.test(identity) && /name|nom/i.test(identity);
    const tableName = typeof context.tableName === 'string' ? context.tableName : '';
    return [variable.key, isGuestName && guest ? guest.fullName : isTableName && tableName ? tableName : variable.defaultValue];
  }));
}
