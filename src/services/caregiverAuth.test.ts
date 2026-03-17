import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = {
  currentUser: { uid: 'caregiver-1', providerData: [] } as {
    uid: string;
    providerData: unknown[];
  } | null,
};

vi.mock('./firebase', () => ({
  auth: mockAuth,
  db: {},
}));

const mockLinkWithCredential = vi.fn().mockResolvedValue({ user: { uid: 'caregiver-1' } });
const mockSignInWithEmailAndPassword = vi.fn().mockResolvedValue({ user: { uid: 'caregiver-1' } });
const mockSendPasswordResetEmail = vi.fn().mockResolvedValue(undefined);
const mockCredential = vi.fn((...args: unknown[]) => ({ email: args[0] }));

vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: mockCredential },
  linkWithCredential: (...args: unknown[]) => mockLinkWithCredential(...args),
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignInWithEmailAndPassword(...args),
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}));

const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
const mockDoc = vi.fn().mockReturnValue('doc-ref');

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
}));

describe('caregiverAuth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = { uid: 'caregiver-1', providerData: [] };
    mockLinkWithCredential.mockResolvedValue({ user: { uid: 'caregiver-1' } });
    mockSignInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'caregiver-1' } });
    mockSendPasswordResetEmail.mockResolvedValue(undefined);
  });

  describe('linkCaregiverEmail', () => {
    it('calls linkWithCredential and updates Firestore email field', async () => {
      const { linkCaregiverEmail } = await import('./caregiverAuth');
      await linkCaregiverEmail('test@example.com', 'password123');

      expect(mockCredential).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(mockLinkWithCredential).toHaveBeenCalledWith(mockAuth.currentUser, {
        email: 'test@example.com',
      });
      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'users', 'caregiver-1');
      expect(mockUpdateDoc).toHaveBeenCalledWith('doc-ref', { email: 'test@example.com' });
    });

    it('throws when no current user', async () => {
      mockAuth.currentUser = null;
      const { linkCaregiverEmail } = await import('./caregiverAuth');
      await expect(linkCaregiverEmail('a@b.com', 'pw')).rejects.toThrow('No authenticated user');
    });

    it('propagates auth/email-already-in-use error', async () => {
      const error = new Error('auth/email-already-in-use');
      (error as unknown as Record<string, unknown>).code = 'auth/email-already-in-use';
      mockLinkWithCredential.mockRejectedValueOnce(error);

      const { linkCaregiverEmail } = await import('./caregiverAuth');
      await expect(linkCaregiverEmail('taken@example.com', 'pw')).rejects.toThrow(
        'auth/email-already-in-use',
      );
    });
  });

  describe('signInCaregiverEmail', () => {
    it('calls signInWithEmailAndPassword and returns user', async () => {
      const { signInCaregiverEmail } = await import('./caregiverAuth');
      const result = await signInCaregiverEmail('test@example.com', 'password123');

      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        mockAuth,
        'test@example.com',
        'password123',
      );
      expect(result.uid).toBe('caregiver-1');
    });

    it('propagates auth/wrong-password error', async () => {
      const error = new Error('auth/wrong-password');
      (error as unknown as Record<string, unknown>).code = 'auth/wrong-password';
      mockSignInWithEmailAndPassword.mockRejectedValueOnce(error);

      const { signInCaregiverEmail } = await import('./caregiverAuth');
      await expect(signInCaregiverEmail('a@b.com', 'wrong')).rejects.toThrow('auth/wrong-password');
    });

    it('propagates auth/user-not-found error', async () => {
      const error = new Error('auth/user-not-found');
      (error as unknown as Record<string, unknown>).code = 'auth/user-not-found';
      mockSignInWithEmailAndPassword.mockRejectedValueOnce(error);

      const { signInCaregiverEmail } = await import('./caregiverAuth');
      await expect(signInCaregiverEmail('no@user.com', 'pw')).rejects.toThrow(
        'auth/user-not-found',
      );
    });
  });

  describe('sendCaregiverPasswordReset', () => {
    it('calls sendPasswordResetEmail', async () => {
      const { sendCaregiverPasswordReset } = await import('./caregiverAuth');
      await sendCaregiverPasswordReset('test@example.com');

      expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(mockAuth, 'test@example.com');
    });

    it('propagates errors', async () => {
      const error = new Error('auth/invalid-email');
      (error as unknown as Record<string, unknown>).code = 'auth/invalid-email';
      mockSendPasswordResetEmail.mockRejectedValueOnce(error);

      const { sendCaregiverPasswordReset } = await import('./caregiverAuth');
      await expect(sendCaregiverPasswordReset('bad-email')).rejects.toThrow('auth/invalid-email');
    });
  });
});
