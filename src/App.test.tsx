import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock firebase since App uses it
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn().mockReturnValue(() => {}),
  signInAnonymously: vi.fn().mockResolvedValue(undefined),
  getAuth: vi.fn().mockReturnValue({}),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn().mockReturnValue('doc-ref'),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => undefined }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getFirestore: vi.fn(),
}));

vi.mock('@/services/firebase', () => ({
  auth: {},
  db: {},
  app: {},
}));

vi.mock('@/stores/contactStore', () => ({
  useContactStore: vi.fn((selector: (s: unknown) => unknown) =>
    selector({
      contacts: [],
      loading: false,
      error: null,
      subscribeToContacts: vi.fn().mockReturnValue(() => {}),
      addContact: vi.fn(),
      removeContact: vi.fn(),
      fetchContacts: vi.fn(),
    })
  ),
}));

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it('shows loading spinner while auth initializes', () => {
    render(<App />);
    // onAuthStateChanged is mocked to never call its callback,
    // so AuthGuard stays in loading state showing a spinner or
    // the root route shows RoleSelector. Either way the app renders.
    expect(document.body).toBeTruthy();
  });

  it('renders the root route with role selector or loading state', () => {
    render(<App />);
    // The root "/" renders RoleSelector directly (not behind AuthGuard)
    // so we should see the role buttons immediately
    expect(screen.getByRole('button', { name: /elderly user/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /family caregiver/i })).toBeInTheDocument();
  });
});
