function normalizeConnectOrigin(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) {
    throw new TypeError('Connect origins must be absolute HTTP(S) URLs.');
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('Connect origins must be absolute HTTP(S) URLs.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || url.hostname.includes('*')) {
    throw new TypeError('Connect origins must be credential-free HTTP(S) URLs without query or hash.');
  }
  return url.origin;
}

export function buildContentSecurityPolicy(nonce, development = false, connectOrigins = []) {
  if (typeof nonce !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(nonce)) {
    throw new TypeError('A base64 nonce is required.');
  }
  if (!Array.isArray(connectOrigins)) throw new TypeError('Connect origins must be provided as a list.');

  const scriptSources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  const connectSources = ["'self'", ...new Set(connectOrigins.map(normalizeConnectOrigin))];
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
