import { describe, expect, it } from 'vitest';

import {
  createSignedCursorCodec,
  InvalidCursorError,
} from '../src/security/signed-cursor.js';

const key = 'test-only-cursor-signing-key-32-bytes-minimum';

describe('signed cursor codec', () => {
  it('round-trips a payload only for the bound viewer', () => {
    const codec = createSignedCursorCodec(key);
    const cursor = codec.encode('viewer-a', {
      endpoint: 'active',
      limit: 20,
      timestamp: '2026-08-30T00:00:00.000Z',
      id: 'a1000000-0000-4000-8000-000000000001',
    });

    expect(codec.decode('viewer-a', cursor)).toMatchObject({
      endpoint: 'active',
      limit: 20,
    });
    expect(() => codec.decode('viewer-b', cursor)).toThrow(InvalidCursorError);
  });

  it('rejects tampering, oversized tokens, and short keys', () => {
    const codec = createSignedCursorCodec(key);
    const cursor = codec.encode('viewer-a', { endpoint: 'history' });

    expect(() => codec.decode('viewer-a', `${cursor}x`)).toThrow(
      InvalidCursorError,
    );
    expect(() => codec.decode('viewer-a', 'a'.repeat(513))).toThrow(
      InvalidCursorError,
    );
    expect(() => createSignedCursorCodec('too-short')).toThrow(
      'at least 32 UTF-8 bytes',
    );
  });
});
