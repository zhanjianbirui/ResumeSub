import { expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '@/shared/base64';

it('roundtrips large byte arrays', () => {
  // getRandomValues is capped at 65536 bytes per call, so fill in two chunks.
  const bytes = new Uint8Array(100_000);
  crypto.getRandomValues(bytes.subarray(0, 50_000));
  crypto.getRandomValues(bytes.subarray(50_000));
  expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
});

it('encodes known value', () => {
  expect(bytesToBase64(new Uint8Array([104, 105]))).toBe('aGk=');
});
