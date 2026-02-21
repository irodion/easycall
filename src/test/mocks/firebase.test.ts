import { describe, it, expect } from 'vitest';
import { server } from './server';
import { http, HttpResponse } from 'msw';

const FIRESTORE_BASE =
  'https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents';

describe('Firebase MSW handlers', () => {
  it('intercepts Firestore document reads with mock data', async () => {
    const response = await fetch(`${FIRESTORE_BASE}/users/user-1`);
    const data = (await response.json()) as Record<string, unknown>;

    expect(response.ok).toBe(true);
    expect(data).toHaveProperty('fields');
  });

  it('intercepts Firestore document writes', async () => {
    const response = await fetch(`${FIRESTORE_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: { displayName: { stringValue: 'Alice' } },
      }),
    });
    const data = (await response.json()) as Record<string, unknown>;

    expect(response.ok).toBe(true);
    expect(data).toHaveProperty('name');
  });

  it('allows per-test handler overrides via server.use()', async () => {
    server.use(
      http.get(
        'https://firestore.googleapis.com/v1/projects/*/databases/*/documents/*',
        () => {
          return HttpResponse.json({ custom: 'override' });
        },
      ),
    );

    const response = await fetch(`${FIRESTORE_BASE}/users/user-1`);
    const data = (await response.json()) as { custom: string };

    expect(data.custom).toBe('override');
  });
});
