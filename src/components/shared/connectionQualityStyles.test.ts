import { describe, it, expect } from 'vitest';
import { mapConnectionQuality } from './connectionQualityStyles';

describe('mapConnectionQuality', () => {
  it('maps 100 to good', () => {
    expect(mapConnectionQuality(100)).toBe('good');
  });

  it('maps 70 to good (boundary)', () => {
    expect(mapConnectionQuality(70)).toBe('good');
  });

  it('maps 69 to fair (boundary)', () => {
    expect(mapConnectionQuality(69)).toBe('fair');
  });

  it('maps 30 to fair (boundary)', () => {
    expect(mapConnectionQuality(30)).toBe('fair');
  });

  it('maps 29 to poor (boundary)', () => {
    expect(mapConnectionQuality(29)).toBe('poor');
  });

  it('maps 0 to poor', () => {
    expect(mapConnectionQuality(0)).toBe('poor');
  });
});
