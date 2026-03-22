import { describe, it, expect } from 'vitest';
import { generateRoomId, generateLinkedRoomId } from './generateRoomId';

describe('generateRoomId', () => {
  it('starts with "easycall-" prefix', () => {
    expect(generateRoomId('Alice')).toMatch(/^easycall-/);
  });

  it('sanitizes name to lowercase alphanumeric', () => {
    const id = generateRoomId('Grandma Rose!');
    // Should not contain spaces, uppercase, or special chars in the name portion
    const namePart = id.replace(/^easycall-/, '').replace(/-[a-z0-9]+$/, '');
    expect(namePart).toMatch(/^[a-z0-9]+$/);
  });

  it('truncates name to exactly 20 characters', () => {
    const id = generateRoomId('VeryLongContactNameThatExceedsTwentyChars');
    const namePart = id.replace(/^easycall-/, '').replace(/-[a-z0-9]+$/, '');
    expect(namePart).toBe('verylongcontactnamethatexceedstwentychar'.slice(0, 20));
  });

  it('generates unique IDs for same name', () => {
    const id1 = generateRoomId('Alice');
    const id2 = generateRoomId('Alice');
    expect(id1).not.toBe(id2);
  });

  it('handles empty name with fallback', () => {
    const id = generateRoomId('');
    expect(id).toMatch(/^easycall-room-[a-z0-9]{12}$/);
  });

  it('handles name with only special characters', () => {
    const id = generateRoomId('!!!');
    expect(id).toMatch(/^easycall-room-[a-z0-9]{12}$/);
  });

  it('suffix is exactly 12 hex characters', () => {
    const id = generateRoomId('Alice');
    const suffix = id.split('-').pop()!;
    expect(suffix).toMatch(/^[a-z0-9]{12}$/);
  });
});

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
