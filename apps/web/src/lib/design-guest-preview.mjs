export function resolveGuestPreviewValues(variables, guest) {
  return Object.fromEntries(variables.map((variable) => {
    const identity = `${variable.key} ${variable.label}`;
    const isGuestName = /guest|invite|invité|invitee/i.test(identity) && /name|nom/i.test(identity);
    return [variable.key, isGuestName && guest ? guest.fullName : variable.defaultValue];
  }));
}
