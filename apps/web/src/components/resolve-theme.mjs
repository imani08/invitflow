/** @param {string | null} stored @returns {'light' | 'dark'} */
export function resolveInitialTheme(stored) {
  return stored === 'light' || stored === 'dark' ? stored : 'light';
}
