#!/usr/bin/env node
/**
 * One-time migration script: backfills roomOwners/{jitsiRoomId} documents
 * from existing users/{userId}/contacts/{contactId} subcollections.
 *
 * Usage:
 *   node scripts/backfill-room-owners.mjs
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS or running in a GCP environment.
 * Or run with: firebase-admin initialized via Application Default Credentials.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize with default credentials (works with `gcloud auth application-default login`)
initializeApp();
const db = getFirestore();

async function backfill() {
  // nosemgrep: no-console-log-sensitive — migration script progress, no PII
  console.log('Fetching all users...');
  const usersSnap = await db.collection('users').get();
  // nosemgrep: no-console-log-sensitive — logs count only
  console.log(`Found ${usersSnap.size} users.`);

  let totalContacts = 0;
  let totalRooms = 0;

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const contactsSnap = await db.collection('users').doc(userId).collection('contacts').get();

    for (const contactDoc of contactsSnap.docs) {
      const data = contactDoc.data();
      const roomId = data['jitsiRoomId'];
      const contactUserId = data['contactUserId'] ?? null;

      if (!roomId) continue;

      totalContacts++;

      const participants = [{ userId, role: 'owner' }];
      if (contactUserId) {
        participants.push({ userId: contactUserId, role: 'contact' });
      }

      await db
        .collection('roomOwners')
        .doc(roomId)
        .set(
          {
            participants: FieldValue.arrayUnion(...participants),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
    }
  }

  // Count created room docs
  const roomsSnap = await db.collection('roomOwners').get();
  totalRooms = roomsSnap.size;

  // nosemgrep: no-console-log-sensitive — logs counts only
  console.log(`Done. Processed ${totalContacts} contacts → ${totalRooms} roomOwners documents.`);
}

backfill().catch((err) => {
  // nosemgrep: no-console-log-sensitive — logs migration error for debugging
  console.error('Migration failed:', err);
  process.exit(1);
});
