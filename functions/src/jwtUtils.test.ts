import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import * as crypto from 'crypto';
import { signJitsiToken } from './jwtUtils.js';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');

describe('signJitsiToken', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const params = {
    uid: 'user-123',
    displayName: 'Alice',
    roomName: 'easycall-alice-abc123',
    appId: 'vpaas-magic-cookie-abc',
    keyId: 'vpaas-magic-cookie-abc/key-001',
    privateKey,
  };

  it('produces a valid RS256 JWT verifiable with the matching public key', () => {
    const token = signJitsiToken(params);
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as Record<
      string,
      unknown
    >;
    expect(decoded).toBeTruthy();
  });

  it('sets aud to "jitsi"', () => {
    const token = signJitsiToken(params);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded['aud']).toBe('jitsi');
  });

  it('sets iss to "chat"', () => {
    const token = signJitsiToken(params);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded['iss']).toBe('chat');
  });

  it('sets sub to appId', () => {
    const token = signJitsiToken(params);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded['sub']).toBe(params.appId);
  });

  it('sets room to roomName', () => {
    const token = signJitsiToken(params);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    expect(decoded['room']).toBe(params.roomName);
  });

  it('sets context.user.id to uid', () => {
    const token = signJitsiToken(params);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    const context = decoded['context'] as Record<string, unknown>;
    const user = context['user'] as Record<string, unknown>;
    expect(user['id']).toBe(params.uid);
  });

  it('sets context.user.moderator to boolean false (not string)', () => {
    const token = signJitsiToken(params);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    const context = decoded['context'] as Record<string, unknown>;
    const user = context['user'] as Record<string, unknown>;
    expect(user['moderator']).toBe(false);
    expect(typeof user['moderator']).toBe('boolean');
  });

  it('token expires approximately 2 hours after iat', () => {
    const token = signJitsiToken(params);
    const decoded = jwt.decode(token) as Record<string, unknown>;
    const iat = decoded['iat'] as number;
    const exp = decoded['exp'] as number;
    // Allow ±60 seconds tolerance
    expect(exp - iat).toBeGreaterThanOrEqual(7140);
    expect(exp - iat).toBeLessThanOrEqual(7260);
  });

  it('JWT header has kid equal to keyId and alg RS256', () => {
    const token = signJitsiToken(params);
    const header = jwt.decode(token, { complete: true })?.header;
    expect(header?.kid).toBe(params.keyId);
    expect(header?.alg).toBe('RS256');
  });
});
