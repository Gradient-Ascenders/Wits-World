import { createHmac, timingSafeEqual } from 'node:crypto';

export class InvalidCursorError extends Error {
  constructor() {
    super('The pagination cursor is invalid.');
    this.name = 'InvalidCursorError';
  }
}

export interface SignedCursorCodec {
  encode<T extends object>(viewerId: string, payload: T): string;
  decode<T extends object>(viewerId: string, cursor: string): T;
}

export function createSignedCursorCodec(signingKey: string): SignedCursorCodec {
  if (Buffer.byteLength(signingKey, 'utf8') < 32) {
    throw new Error(
      'ASYNC_PVP_CURSOR_SIGNING_KEY must contain at least 32 UTF-8 bytes.',
    );
  }

  return {
    encode(viewerId, payload) {
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
        'base64url',
      );
      const signature = sign(signingKey, viewerId, encodedPayload);
      return `${encodedPayload}.${signature}`;
    },

    decode(viewerId, cursor) {
      if (cursor.length > 512) {
        throw new InvalidCursorError();
      }

      const [encodedPayload, suppliedSignature, extra] = cursor.split('.');
      if (!encodedPayload || !suppliedSignature || extra !== undefined) {
        throw new InvalidCursorError();
      }

      const expectedSignature = sign(signingKey, viewerId, encodedPayload);
      const supplied = Buffer.from(suppliedSignature, 'base64url');
      const expected = Buffer.from(expectedSignature, 'base64url');

      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      ) {
        throw new InvalidCursorError();
      }

      try {
        const parsed: unknown = JSON.parse(
          Buffer.from(encodedPayload, 'base64url').toString('utf8'),
        );

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new InvalidCursorError();
        }

        return parsed as never;
      } catch (error) {
        if (error instanceof InvalidCursorError) {
          throw error;
        }

        throw new InvalidCursorError();
      }
    },
  };
}

function sign(
  signingKey: string,
  viewerId: string,
  encodedPayload: string,
): string {
  return createHmac('sha256', signingKey)
    .update(`${viewerId}\n${encodedPayload}`)
    .digest('base64url');
}
