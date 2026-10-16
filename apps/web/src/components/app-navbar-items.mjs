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

export function getDefaultPostLoginDestination(returnTo, roles = []) {
  if (isSafeReturnTo(returnTo) && returnTo !== '/dashboard') return returnTo;
  const granted = new Set(Array.isArray(roles) ? roles.filter((role) => typeof role === 'string') : []);
  if (granted.has('SUPER_ADMIN') || granted.has('SUPPORT_ADMIN')) return '/admin';
  if (granted.has('FINANCE_ADMIN')) return '/admin/finance';
  return '/dashboard';
}

export function isSafeReturnTo(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048 &&
    value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') &&
    !/[\u0000-\u001f\u007f]/.test(value);
}
