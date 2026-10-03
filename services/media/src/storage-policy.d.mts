export function storageLevel(percentage: number, thresholds?: { warning?: number; serious?: number; critical?: number; emergency?: number }): 'NORMAL' | 'WARNING' | 'SERIOUS' | 'CRITICAL' | 'EMERGENCY' | 'UNKNOWN';
export function shouldBlockLargeStorageOperation(percentage: number, thresholds?: { warning?: number; serious?: number; critical?: number; emergency?: number }): boolean;
