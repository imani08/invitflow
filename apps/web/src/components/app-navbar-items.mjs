/** @typedef {{ href: string, label: string, icon: string, primary?: boolean }} MobileNavigationItem */

/** @type {MobileNavigationItem} */
export const notificationMobileItem = { href: '/account/notifications', label: 'Alertes', icon: 'bell' };

/** @param {MobileNavigationItem[]} items @returns {MobileNavigationItem[]} */
export function uniqueNavigationItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.href}:${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getDefaultPostLoginDestination(returnTo) {
  return isSafeReturnTo(returnTo) ? returnTo : '/';
}

export function isSafeReturnTo(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048 &&
    value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') &&
    !/[\u0000-\u001f\u007f]/.test(value);
}
