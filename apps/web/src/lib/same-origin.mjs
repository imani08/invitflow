export function isExpectedOrigin(origin, expectedOrigin) {
  if (typeof origin !== 'string' || typeof expectedOrigin !== 'string') return false;
  try {
    const actual = new URL(origin);
    const expected = new URL(expectedOrigin);
    return (
      (actual.protocol === 'http:' || actual.protocol === 'https:') &&
      actual.origin === origin &&
      actual.origin === expected.origin
    );
  } catch {
    return false;
  }
}
