export function logStructured(level: 'info' | 'warn' | 'error', message: string, attributes: Record<string, string | number | boolean> = {}) {
  const record = { timestamp: new Date().toISOString(), level, message, ...attributes };
  console.log(JSON.stringify(record));
}
