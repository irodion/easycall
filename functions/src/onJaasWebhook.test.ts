import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(() => ({
    sendEachForMulticast: vi.fn().mockResolvedValue({ responses: [] }),
  })),
}));
vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((...args: unknown[]) => (args.length === 2 ? args[1] : args[0])),
  onRequest: vi.fn((fn: unknown) => fn),
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_path: unknown, fn: unknown) => fn),
}));
vi.mock('firebase-functions/v2/database', () => ({
  onValueWritten: vi.fn((_path: unknown, fn: unknown) => fn),
}));
vi.mock('firebase-functions/v2/pubsub', () => ({
  onMessagePublished: vi.fn((_topic: unknown, fn: unknown) => fn),
}));
vi.mock('jsonwebtoken', () => ({
  default: { sign: vi.fn().mockReturnValue('mock-token') },
}));

describe('handleJaasParticipantJoined', () => {
  let handleJaasParticipantJoined: typeof import('./index').handleJaasParticipantJoined;
  let mockDb: {
    doc: ReturnType<typeof vi.fn>;
  };
  let mockDocGet: ReturnType<typeof vi.fn>;
  let mockDocSet: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDocGet = vi.fn();
    mockDocSet = vi.fn().mockResolvedValue(undefined);

    vi.doMock('firebase-admin/firestore', () => ({
      getFirestore: vi.fn(),
      FieldValue: { serverTimestamp: vi.fn(() => 'server-timestamp') },
      Timestamp: { now: vi.fn(), fromMillis: vi.fn() },
    }));

    mockDb = {
      doc: vi.fn(() => ({
        get: mockDocGet,
        set: mockDocSet,
      })),
    };

    const mod = await import('./index');
    handleJaasParticipantJoined = mod.handleJaasParticipantJoined;
  });

  it('returns false for non-direct-link rooms', async () => {
    const result = await handleJaasParticipantJoined(mockDb as never, 'regular-room-id', 'Alice');
    expect(result).toBe(false);
    expect(mockDb.doc).not.toHaveBeenCalled();
  });

  it('returns false when room doc does not exist', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false });
    const result = await handleJaasParticipantJoined(
      mockDb as never,
      'easycall-direct-abc123',
      'Alice',
    );
    expect(result).toBe(false);
  });

  it('returns false when link is revoked', async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ revoked: true, contactUserId: 'user-1' }),
    });
    const result = await handleJaasParticipantJoined(
      mockDb as never,
      'easycall-direct-abc123',
      'Alice',
    );
    expect(result).toBe(false);
  });

  it('writes incoming call signaling doc for active link', async () => {
    mockDocGet
      // First call: directLinksByRoom lookup
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({
          revoked: false,
          contactUserId: 'contact-1',
          elderlyUserId: 'elderly-1',
          callerDisplayName: 'Grandma',
        }),
      })
      // Second call: user doc for push tokens
      .mockResolvedValueOnce({
        exists: true,
        data: () => ({ pushTokens: [] }),
      });

    const result = await handleJaasParticipantJoined(
      mockDb as never,
      'easycall-direct-abc123',
      'Alice',
    );
    expect(result).toBe(true);
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        callerId: 'direct-link',
        callerName: 'Grandma',
        jitsiRoomId: 'easycall-direct-abc123',
        status: 'ringing',
      }),
    );
  });
});

describe('verifyJaasWebhookSignature', () => {
  let verifyJaasWebhookSignature: typeof import('./index').verifyJaasWebhookSignature;

  beforeEach(async () => {
    vi.doMock('firebase-admin/firestore', () => ({
      getFirestore: vi.fn(),
      FieldValue: { serverTimestamp: vi.fn() },
      Timestamp: { now: vi.fn(), fromMillis: vi.fn() },
    }));
    const mod = await import('./index');
    verifyJaasWebhookSignature = mod.verifyJaasWebhookSignature;
  });

  it('returns false when signature is undefined', () => {
    expect(verifyJaasWebhookSignature('body', undefined, 'secret')).toBe(false);
  });

  it('returns true for valid HMAC signature', async () => {
    const crypto = await import('crypto');
    const body = '{"eventType":"PARTICIPANT_JOINED"}';
    const secret = 'test-secret';
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyJaasWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    expect(verifyJaasWebhookSignature('body', 'invalid-sig', 'secret')).toBe(false);
  });
});
