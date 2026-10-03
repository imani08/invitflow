export function storageLevel(percentage, thresholds = {}) {
  const warning = Number(thresholds.warning ?? 70);
  const serious = Number(thresholds.serious ?? 80);
  const critical = Number(thresholds.critical ?? 90);
  const emergency = Number(thresholds.emergency ?? 95);
  if (![warning, serious, critical, emergency].every(Number.isFinite) || warning >= serious || serious >= critical || critical >= emergency || warning < 1 || emergency > 100)
    throw new TypeError('Storage thresholds must be increasing percentages between 1 and 100');
  if (!Number.isFinite(percentage) || percentage < 0) return 'UNKNOWN';
  if (percentage >= emergency) return 'EMERGENCY';
  if (percentage >= critical) return 'CRITICAL';
  if (percentage >= serious) return 'SERIOUS';
  if (percentage >= warning) return 'WARNING';
  return 'NORMAL';
}

export function shouldBlockLargeStorageOperation(percentage, thresholds) {
  return storageLevel(percentage, thresholds) === 'EMERGENCY';
}
