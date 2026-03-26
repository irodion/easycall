import { describe, it, expect } from 'vitest';
import { generateLinkedRoomId } from './generateRoomId';

describe('generateLinkedRoomId', () => {
  it('produces the same room ID regardless of argument order', () => {
    const id1 = generateLinkedRoomId('user-alice-123', 'user-bob-456');
    const id2 = generateLinkedRoomId('user-bob-456', 'user-alice-123');
    expect(id1).toBe(id2);
  });

  it('starts with "easycall-link-" prefix', () => {
    expect(generateLinkedRoomId('uid-a', 'uid-b')).toMatch(/^easycall-link-/);
  });

  it('produces different room IDs for different user pairs', () => {
    const id1 = generateLinkedRoomId('user-a', 'user-b');
    const id2 = generateLinkedRoomId('user-a', 'user-c');
    expect(id1).not.toBe(id2);
  });

  it('is deterministic — same inputs always produce same output', () => {
    const id1 = generateLinkedRoomId('abc123', 'def456');
    const id2 = generateLinkedRoomId('abc123', 'def456');
    expect(id1).toBe(id2);
  });

  it('preserves case to avoid collisions', () => {
    const id1 = generateLinkedRoomId('ABCabc', 'DEFdef');
    const id2 = generateLinkedRoomId('abcABC', 'defDEF');
    expect(id1).not.toBe(id2);
  });

  it('uses full UIDs without truncation', () => {
    const uid1 = 'abcdefghijklmnopqrstuvwxyz12';
    const uid2 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ34';
    const id = generateLinkedRoomId(uid1, uid2);
    expect(id).toContain(uid1);
    expect(id).toContain(uid2);
  });
});
