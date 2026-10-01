export class ImageValidationError extends Error {
  code: string;
}

export function inspectUserImage(
  bytes: Buffer,
  filename: string,
  declaredMimeType: string,
): Readonly<{
  format: 'png' | 'jpeg' | 'webp';
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
}>;
