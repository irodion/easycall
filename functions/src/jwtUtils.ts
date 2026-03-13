import jwt from 'jsonwebtoken';

export interface JitsiTokenParams {
  uid: string;
  displayName: string;
  roomName: string;
  appId: string;
  keyId: string;
  privateKey: string;
}

export function signJitsiToken(params: JitsiTokenParams): string {
  const { uid, displayName, roomName, appId, keyId, privateKey } = params;

  return jwt.sign(
    {
      aud: 'jitsi',
      iss: 'chat',
      sub: appId,
      room: roomName,
      context: {
        user: {
          id: uid,
          name: displayName,
          moderator: false,
        },
      },
    },
    privateKey,
    {
      algorithm: 'RS256',
      header: { kid: keyId, typ: 'JWT', alg: 'RS256' },
      expiresIn: '2h',
    },
  );
}
