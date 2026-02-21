/** Firestore Timestamp placeholder — replaced by firebase/firestore import when Firebase is added */
export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
  toDate: () => Date;
}

export interface EasyCallUser {
  uid: string;
  displayName: string;
  role: 'elderly' | 'caregiver';
  email: string;
  settings: UserSettings;
  pushTokens: string[];
  onboardingComplete: boolean;
  lastSeen: FirestoreTimestamp;
  createdAt: FirestoreTimestamp;
}

export interface UserSettings {
  fontSize: 'large' | 'x-large';
  highContrast: boolean;
  ringtoneVolume: number;
  autoAnswer: boolean;
}

export interface Contact {
  id: string;
  name: string;
  photoURL: string;
  jitsiRoomId: string;
  contactUserId: string;
  displayOrder: number;
  createdAt: FirestoreTimestamp;
}
