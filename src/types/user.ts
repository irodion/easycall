/** Firestore Timestamp placeholder — replaced by firebase/firestore import when Firebase is added */
export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
  toDate: () => Date;
}

export type PresenceState = 'online' | 'in-call' | 'offline';

export interface EasyCallUser {
  uid: string;
  displayName: string;
  role: 'elderly' | 'caregiver';
  email: string | null;
  settings: UserSettings;
  pushTokens: string[];
  onboardingComplete: boolean;
  presenceState: PresenceState;
  lastSeen: FirestoreTimestamp;
  createdAt: FirestoreTimestamp;
}

import type { SupportedLanguage } from '@/i18n';

export interface UserSettings {
  fontSize: 'large' | 'x-large';
  highContrast: boolean;
  ringtoneVolume: number;
  autoAnswer: boolean;
  appLockEnabled: boolean;
  appLockPinHash: string | null;
  language: SupportedLanguage;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  fontSize: 'large',
  highContrast: false,
  ringtoneVolume: 80,
  autoAnswer: false,
  appLockEnabled: false,
  appLockPinHash: null,
  language: 'en',
};

export interface Contact {
  id: string;
  name: string;
  photoURL: string | null;
  jitsiRoomId: string;
  contactUserId: string;
  displayOrder: number;
  createdAt: FirestoreTimestamp;
}

export interface CallHistoryEntry {
  id: string;
  contactId: string;
  contactName: string;
  direction: 'outgoing' | 'incoming';
  outcome: 'completed' | 'missed' | 'declined';
  duration: number; // seconds
  startedAt: FirestoreTimestamp;
  endedAt: FirestoreTimestamp;
}

export interface ActiveCallData {
  contactId: string;
  contactName: string;
  jitsiRoomId: string;
  startedAt: FirestoreTimestamp;
  status: 'active' | 'ended';
}
