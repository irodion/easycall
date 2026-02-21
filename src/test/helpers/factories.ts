import type { EasyCallUser, Contact, FirestoreTimestamp } from '@/types/user';

let userIdCounter = 0;
let contactIdCounter = 0;

function mockTimestamp(date = new Date()): FirestoreTimestamp {
  return {
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
    toDate: () => date,
  };
}

export function createMockUser(
  overrides: Partial<EasyCallUser> = {},
): EasyCallUser {
  userIdCounter += 1;
  return {
    uid: `user-${String(userIdCounter)}`,
    displayName: `Test User ${String(userIdCounter)}`,
    role: 'elderly',
    email: `user${String(userIdCounter)}@example.com`,
    settings: {
      fontSize: 'large',
      highContrast: false,
      ringtoneVolume: 80,
      autoAnswer: false,
    },
    pushTokens: [],
    onboardingComplete: false,
    lastSeen: mockTimestamp(),
    createdAt: mockTimestamp(),
    ...overrides,
  };
}

export function createMockContact(
  overrides: Partial<Contact> = {},
): Contact {
  contactIdCounter += 1;
  return {
    id: `contact-${String(contactIdCounter)}`,
    name: `Contact ${String(contactIdCounter)}`,
    photoURL: `https://example.com/photos/contact-${String(contactIdCounter)}.jpg`,
    jitsiRoomId: `room-${String(contactIdCounter)}`,
    contactUserId: `user-${String(contactIdCounter)}`,
    displayOrder: contactIdCounter,
    createdAt: mockTimestamp(),
    ...overrides,
  };
}
