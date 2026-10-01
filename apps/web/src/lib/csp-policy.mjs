export function buildContentSecurityPolicy(nonce, development = false) {
  if (typeof nonce !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(nonce)) {
    throw new TypeError('A base64 nonce is required.');
  }

  const scriptSources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  const connectSources = ["'self'"];
  if (development) {
    scriptSources.push("'unsafe-eval'");
    connectSources.push('ws:', 'wss:');
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src ${connectSources.join(' ')}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
