import { BadRequestException } from '@nestjs/common';

export interface Cursor {
  createdAt: string;
  id: string;
}

/**
 * Keyset cursors are opaque to the client: we base64url-encode the (createdAt,
 * id) pair of the last seen row. Opaqueness lets us change the ordering key
 * later without breaking clients.
 */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed?.createdAt !== 'string' ||
      typeof parsed?.id !== 'string' ||
      Number.isNaN(Date.parse(parsed.createdAt))
    ) {
      throw new Error('malformed');
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}
