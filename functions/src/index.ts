import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { initializeApp } from 'firebase-admin/app';
import jwt from 'jsonwebtoken';

initializeApp();

// ---------------------------------------------------------------------------
// validatePairingCode
//
// Called by the caregiver app when the user enters a 6-digit pairing code.
// Atomically validates the code, marks it used, and writes the caregiver link.
// This is the ONLY path that writes to users/{userId}/caregivers/{uid} —
// client writes to that subcollection are blocked in firestore.rules.
// ---------------------------------------------------------------------------
export const validatePairingCode = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const data = typeof request.data === 'object' && request.data !== null ? request.data : {};
  const { code } = data as { code?: unknown };

  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'code must be a 6-digit numeric string.');
  }

  const caregiverUid = request.auth.uid;
  const db = getFirestore();
  const codeRef = db.collection('pairingCodes').doc(code);

  return db.runTransaction(async (txn) => {
    const codeDoc = await txn.get(codeRef);

    if (!codeDoc.exists) {
      throw new HttpsError('not-found', 'Invalid pairing code.');
    }

    const data = codeDoc.data()!;

    if (data['used'] === true) {
      throw new HttpsError('already-exists', 'Pairing code has already been used.');
    }

    if ((data['expiresAt'] as FirebaseFirestore.Timestamp).toDate() < new Date()) {
      throw new HttpsError('deadline-exceeded', 'Pairing code has expired.');
    }

    const elderlyUserId = data['elderlyUserId'] as string;

    if (elderlyUserId === caregiverUid) {
      throw new HttpsError('invalid-argument', 'Cannot pair an account with itself.');
    }

    txn.update(codeRef, { used: true });

    const caregiverRef = db
      .collection('users')
      .doc(elderlyUserId)
      .collection('caregivers')
      .doc(caregiverUid);

    txn.set(caregiverRef, {
      linkedAt: FieldValue.serverTimestamp(),
      permissions: ['manage_contacts', 'manage_settings', 'view_history'],
    });

    return { elderlyUserId };
  });
});

// ---------------------------------------------------------------------------
// generateJitsiJwt
//
// Issues a JaaS JWT only after verifying the requesting user is a legitimate
// participant in the room (elderly user, the contact, or a linked caregiver).
// P0-2: moderator is boolean false — never a string.
// P0-3: room ownership is verified via a collectionGroup query before signing.
// ---------------------------------------------------------------------------
export const generateJitsiJwt = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const requestData =
    typeof request.data === 'object' && request.data !== null ? request.data : {};
  const { roomName, displayName } = requestData as {
    roomName?: unknown;
    displayName?: unknown;
  };

  if (typeof roomName !== 'string' || !roomName) {
    throw new HttpsError('invalid-argument', 'roomName is required.');
  }
  if (typeof displayName !== 'string' || !displayName) {
    throw new HttpsError('invalid-argument', 'displayName is required.');
  }

  const uid = request.auth.uid;
  const db = getFirestore();

  // Find the contact record that owns this room ID (across all users).
  // No limit() — we require exactly one match. Multiple matches would mean
  // a room ID collision, which must not silently authorize via the wrong record.
  const contactsSnap = await db
    .collectionGroup('contacts')
    .where('jitsiRoomId', '==', roomName)
    .get();

  if (contactsSnap.empty) {
    throw new HttpsError('not-found', 'Room not found.');
  }
  if (contactsSnap.size !== 1) {
    throw new HttpsError('internal', 'Ambiguous room ID — multiple contacts share this room.');
  }

  const contactDoc = contactsSnap.docs[0]!;
  const contactData = contactDoc.data();
  // Path: users/{elderlyUserId}/contacts/{contactId}
  const elderlyUserId = contactDoc.ref.parent.parent!.id;

  const isElderlyUser = uid === elderlyUserId;
  const isContactUser = contactData['contactUserId'] != null && uid === contactData['contactUserId'];

  let isCaregiverUser = false;
  if (!isElderlyUser && !isContactUser) {
    const caregiverDoc = await db
      .collection('users')
      .doc(elderlyUserId)
      .collection('caregivers')
      .doc(uid)
      .get();
    isCaregiverUser = caregiverDoc.exists;
  }

  if (!isElderlyUser && !isContactUser && !isCaregiverUser) {
    throw new HttpsError('permission-denied', 'Not a participant in this room.');
  }

  const privateKey = process.env['JAAS_PRIVATE_KEY'];
  const appId = process.env['JAAS_APP_ID'];
  const keyId = process.env['JAAS_KEY_ID'];

  if (!privateKey || !appId || !keyId) {
    throw new HttpsError('internal', 'JaaS configuration is missing.');
  }

  const token = jwt.sign(
    {
      aud: 'jitsi',
      iss: 'chat',
      sub: appId,
      room: roomName,
      context: {
        user: {
          id: uid,
          name: displayName,
          moderator: false, // boolean — string 'false' is truthy and would grant moderator rights
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

  return { token };
});

// ---------------------------------------------------------------------------
// onIncomingCall
//
// Triggers when a caller writes to users/{elderlyUserId}/incomingCall/current.
// Sends an FCM push notification to all of the elderly user's registered
// push tokens so their device wakes up when the PWA is backgrounded.
// ---------------------------------------------------------------------------
export const onIncomingCall = onDocumentWritten(
  'users/{elderlyUserId}/incomingCall/current',
  async (event) => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();
    // Only notify on a transition into 'ringing', not on subsequent updates
    // that leave status unchanged (e.g. a no-op write on an already-ringing doc).
    if (!after || after['status'] !== 'ringing') return;
    if (before && before['status'] === 'ringing') return;

    const db = getFirestore();
    const elderlyDoc = await db.doc(`users/${event.params['elderlyUserId']}`).get();
    const pushTokens: string[] = elderlyDoc.data()?.['pushTokens'] ?? [];

    if (pushTokens.length === 0) return;

    const STALE_TOKEN_ERRORS = new Set([
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
    ]);

    const FCM_BATCH_LIMIT = 500;
    const payload = {
      data: {
        type: 'incoming_call',
        callerName: String(after['callerName'] ?? ''),
        callerPhoto: String(after['callerPhotoURL'] ?? ''),
        roomId: String(after['jitsiRoomId'] ?? ''),
        elderlyUserId: event.params['elderlyUserId'],
      },
      android: {
        priority: 'high' as const,
        ttl: 60_000, // matches the 60-second call timeout
      },
      webpush: {
        headers: { Urgency: 'high' },
        fcmOptions: { link: `/call/${after['jitsiRoomId']}` },
      },
    };

    const staleTokens: string[] = [];
    let totalFails = 0;

    for (let i = 0; i < pushTokens.length; i += FCM_BATCH_LIMIT) {
      const chunk = pushTokens.slice(i, i + FCM_BATCH_LIMIT);
      const response = await getMessaging().sendEachForMulticast({ tokens: chunk, ...payload });

      response.responses.forEach((r, j) => {
        if (!r.success) {
          totalFails++;
          if (STALE_TOKEN_ERRORS.has(r.error?.code ?? '')) {
            staleTokens.push(chunk[j]!);
          }
        }
      });
    }

    // Remove stale tokens so future sends don't hit dead registrations.
    if (staleTokens.length > 0) {
      console.log(
        `Removing ${staleTokens.length} stale FCM token(s) for user ${event.params['elderlyUserId']}`,
      );
      await db
        .doc(`users/${event.params['elderlyUserId']}`)
        .update({ pushTokens: FieldValue.arrayRemove(...staleTokens) });
    }

    if (totalFails > 0) {
      console.error(
        `FCM: ${totalFails} of ${pushTokens.length} sends failed for user ${event.params['elderlyUserId']}`,
      );
    }
  },
);
