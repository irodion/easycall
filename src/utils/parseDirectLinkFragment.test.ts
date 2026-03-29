import { describe, it, expect } from 'vitest';
import { parseDirectLinkFragment } from './parseDirectLinkFragment';

describe('parseDirectLinkFragment', () => {
  it('parses valid fragment with all params', () => {
    const result = parseDirectLinkFragment('#token=abc123&room=easycall-direct-xyz&name=Grandma');
    expect(result).toEqual({ token: 'abc123', room: 'easycall-direct-xyz', name: 'Grandma' });
  });

  it('parses fragment without leading #', () => {
    const result = parseDirectLinkFragment('token=abc123&room=easycall-direct-xyz&name=Grandma');
    expect(result).toEqual({ token: 'abc123', room: 'easycall-direct-xyz', name: 'Grandma' });
  });

  it('returns null for empty hash', () => {
    expect(parseDirectLinkFragment('')).toBeNull();
    expect(parseDirectLinkFragment('#')).toBeNull();
  });

  it('returns null when token is missing', () => {
    expect(parseDirectLinkFragment('#room=easycall-direct-xyz&name=Grandma')).toBeNull();
  });

  it('returns null when room is missing', () => {
    expect(parseDirectLinkFragment('#token=abc123&name=Grandma')).toBeNull();
  });

  it('defaults name to empty string when missing', () => {
    const result = parseDirectLinkFragment('#token=abc123&room=easycall-direct-xyz');
    expect(result).toEqual({ token: 'abc123', room: 'easycall-direct-xyz', name: '' });
  });

  it('handles URL-encoded name', () => {
    const result = parseDirectLinkFragment(
      '#token=abc123&room=easycall-direct-xyz&name=Grand%20Mother',
    );
    expect(result).toEqual({ token: 'abc123', room: 'easycall-direct-xyz', name: 'Grand Mother' });
  });

  it('handles long JWT tokens', () => {
    const longToken = 'eyJ' + 'a'.repeat(800);
    const result = parseDirectLinkFragment(`#token=${longToken}&room=easycall-direct-xyz`);
    expect(result?.token).toBe(longToken);
  });
});
