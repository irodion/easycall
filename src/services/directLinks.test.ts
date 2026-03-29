import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCallable = vi.fn();

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => 'mock-functions'),
  httpsCallable: vi.fn(() => mockCallable),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
}));

vi.mock('@/services/firebase', () => ({
  app: {},
  db: {},
}));

describe('directLinks service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generateDirectLink calls Cloud Function with correct params', async () => {
    mockCallable.mockResolvedValueOnce({
      data: { linkId: 'abc123', url: 'https://example.com/join#token=...' },
    });

    const { generateDirectLink } = await import('./directLinks');
    const result = await generateDirectLink('elderly-1', 'contact-1', 'Grandma');

    expect(mockCallable).toHaveBeenCalledWith({
      elderlyUserId: 'elderly-1',
      contactId: 'contact-1',
      callerDisplayName: 'Grandma',
    });
    expect(result).toEqual({ linkId: 'abc123', url: 'https://example.com/join#token=...' });
  });

  it('revokeDirectLink calls Cloud Function with linkId', async () => {
    mockCallable.mockResolvedValueOnce({ data: { success: true } });

    const { revokeDirectLink } = await import('./directLinks');
    await revokeDirectLink('abc123');

    expect(mockCallable).toHaveBeenCalledWith({ linkId: 'abc123' });
  });

  it('subscribeToDirectLinks creates a Firestore query with correct filters', async () => {
    const { onSnapshot, query, where, orderBy, collection } = await import('firebase/firestore');
    const { subscribeToDirectLinks } = await import('./directLinks');

    const callback = vi.fn();
    subscribeToDirectLinks('elderly-1', 'caregiver-1', callback);

    expect(collection).toHaveBeenCalled();
    expect(where).toHaveBeenCalledWith('elderlyUserId', '==', 'elderly-1');
    expect(where).toHaveBeenCalledWith('createdBy', '==', 'caregiver-1');
    expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(query).toHaveBeenCalled();
    expect(onSnapshot).toHaveBeenCalled();
  });
});
