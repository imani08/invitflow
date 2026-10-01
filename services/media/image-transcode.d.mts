export class ImageTranscodeError extends Error {
  code: string;
}

export function transcodeUserImage(bytes: Buffer): Promise<
  Readonly<{
    bytes: Buffer;
    mimeType: 'image/webp';
    width: number;
    height: number;
    preview: Buffer;
    thumbnail: Buffer;
  }>
>;
