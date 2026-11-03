import { AppError } from './errors';

export const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpeg: 'image/jpeg',
} as const;
export type AllowedMime = (typeof MIME)[keyof typeof MIME];

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

function containsAscii(b: Uint8Array, needle: string): boolean {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = 0; i <= b.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) if (b[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

/** Detects the real file type from magic bytes (the declared type is not trusted). */
export function detectMime(b: Uint8Array): AllowedMime | null {
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return MIME.pdf; // %PDF-
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return MIME.png;
  if (startsWith(b, [0xff, 0xd8, 0xff])) return MIME.jpeg;
  // DOCX = ZIP container with a Word main document part.
  if (
    startsWith(b, [0x50, 0x4b, 0x03, 0x04]) &&
    containsAscii(b, '[Content_Types].xml') &&
    containsAscii(b, 'word/')
  ) {
    return MIME.docx;
  }
  return null;
}

const EXT: Record<AllowedMime, string> = {
  [MIME.pdf]: '.pdf',
  [MIME.docx]: '.docx',
  [MIME.png]: '.png',
  [MIME.jpeg]: '.jpg',
};

/** Keeps a readable, safe display filename with the extension matching the real type. */
export function safeFilename(name: string, mime: AllowedMime): string {
  const base = name
    .replace(/\.[^.]*$/, '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} ._-]/gu, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `${base || 'document'}${EXT[mime]}`;
}

export interface ValidatedFile {
  bytes: Uint8Array;
  mime: AllowedMime;
  filename: string;
  size: number;
}

/** Validates a multipart upload: presence, size limit, magic bytes against an allow-list. */
export async function validateUpload(
  file: unknown,
  maxBytes: number,
  allowed: readonly AllowedMime[],
): Promise<ValidatedFile> {
  if (!(file instanceof File)) throw new AppError(400, 'BAD_REQUEST', 'File missing');
  if (file.size === 0) throw new AppError(400, 'BAD_REQUEST', 'File is empty');
  if (file.size > maxBytes)
    throw new AppError(413, 'FILE_TOO_LARGE', 'File too large', { maxBytes });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectMime(bytes);
  if (!mime || !allowed.includes(mime)) {
    throw new AppError(415, 'FILE_TYPE_NOT_ALLOWED', 'File type not allowed', { allowed });
  }
  return { bytes, mime, filename: safeFilename(file.name || 'document', mime), size: bytes.length };
}
