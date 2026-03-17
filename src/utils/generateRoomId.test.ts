import { describe, it, expect } from 'vitest';
import { generateRoomId } from './generateRoomId';

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

  it('truncates name to 20 characters', () => {
    const id = generateRoomId('VeryLongContactNameThatExceedsTwentyChars');
    const namePart = id.replace(/^easycall-/, '').replace(/-[a-z0-9]+$/, '');
    expect(namePart.length).toBeLessThanOrEqual(20);
  });

  it('generates unique IDs for same name', () => {
    const id1 = generateRoomId('Alice');
    const id2 = generateRoomId('Alice');
    expect(id1).not.toBe(id2);
  });

  it('handles empty name with fallback', () => {
    const id = generateRoomId('');
    expect(id).toMatch(/^easycall-room-[a-z0-9]+$/);
  });

  it('handles name with only special characters', () => {
    const id = generateRoomId('!!!');
    expect(id).toMatch(/^easycall-room-[a-z0-9]+$/);
  });
});
