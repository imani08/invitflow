export function createBoundedPostUpload(options: {
  endpoint: URL;
  bucket: string;
  key: string;
  contentType: string;
  maxBytes: number;
  region: string;
  accessKey: string;
  secretKey: string;
  now?: Date;
  expiresInSeconds?: number;
}): {
  url: string;
  method: 'POST';
  fields: Readonly<Record<string, string>>;
  expiresInSeconds: number;
};

export function createSignedGetDownload(options: {
  endpoint: URL;
  bucket: string;
  key: string;
  region: string;
  accessKey: string;
  secretKey: string;
  now?: Date;
  expiresInSeconds?: number;
}): { url: string; method: 'GET'; headers: Readonly<Record<string, string>>; expiresInSeconds: number };
