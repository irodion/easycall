import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin } from './pinHash';

describe('hashPin', () => {
  it('returns a consistent hex string for the same input', async () => {
    const hash1 = await hashPin('1234');
    const hash2 = await hashPin('1234');
    expect(hash1).toBe(hash2);
  });

  it('returns different hashes for different PINs', async () => {
    const hash1 = await hashPin('1234');
    const hash2 = await hashPin('5678');
    expect(hash1).not.toBe(hash2);
  });

  it('returns a 64-character hex string (SHA-256)', async () => {
    const hash = await hashPin('0042');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for same PIN with different userIds', async () => {
    const hash1 = await hashPin('1234', 'user-1');
    const hash2 = await hashPin('1234', 'user-2');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPin', () => {
  it('returns true for correct PIN', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('1234', hash)).toBe(true);
  });

  it('returns false for wrong PIN', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('0000', hash)).toBe(false);
  });

  it('handles PINs with leading zeros', async () => {
    const hash = await hashPin('0042');
    expect(await verifyPin('0042', hash)).toBe(true);
    expect(await verifyPin('42', hash)).toBe(false);
  });

  it('verifies salted hash when userId is provided', async () => {
    const hash = await hashPin('1234', 'user-1');
    expect(await verifyPin('1234', hash, 'user-1')).toBe(true);
  });

  it('salted hash does not verify without userId', async () => {
    const saltedHash = await hashPin('1234', 'user-1');
    expect(await verifyPin('1234', saltedHash)).toBe(false);
  });

  it('falls back to legacy unsalted hash when salted does not match', async () => {
    const legacyHash = await hashPin('1234');
    expect(await verifyPin('1234', legacyHash, 'user-1')).toBe(true);
  });

  it('returns false when neither salted nor legacy hash matches', async () => {
    const hash = await hashPin('1234', 'user-1');
    expect(await verifyPin('0000', hash, 'user-1')).toBe(false);
  });
});
