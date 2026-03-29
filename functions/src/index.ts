import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onValueWritten } from 'firebase-functions/v2/database';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { initializeApp } from 'firebase-admin/app';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

initializeApp();

function extractData(request: { data: unknown }): Record<string, unknown> {
  return typeof request.data === 'object' && request.data !== null
    ? (request.data as Record<string, unknown>)
    : {};
}

// ---------------------------------------------------------------------------
// validatePairingCode
//
// Called by the admin app when the user enters a 6-digit pairing code.
// Atomically validates the code, marks it used, and writes the admin link.
// This is the ONLY path that writes to users/{userId}/caregivers/{uid} —
// client writes to that subcollection are blocked in firestore.rules.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Rate limiting — generic sliding-window throttle backed by a Firestore doc
// at rateLimits/{docKeyPrefix}:{uid}. Exported for testing.
// ---------------------------------------------------------------------------
interface RateLimitOptions {
  docKeyPrefix: string;
  maxAttempts: number;
  windowMs: number;
  errorMessage: string;
}

export async function checkRateLimit(
  db: Firestore,
  uid: string,
  options: RateLimitOptions,
): Promise<void> {
  const rateLimitRef = db.collection('rateLimits').doc(`${options.docKeyPrefix}:${uid}`);
  const now = Date.now();
  const windowStart = now - options.windowMs;

  await db.runTransaction(async (txn) => {
    const snap = await txn.get(rateLimitRef);
    const data = snap.data();
    const attempts: number[] = data?.['attempts'] ?? [];
    const recentAttempts = attempts.filter((ts: number) => ts > windowStart);

    if (recentAttempts.length >= options.maxAttempts) {
      throw new HttpsError('resource-exhausted', options.errorMessage);
    }

    recentAttempts.push(now);
    // Keep only the most recent entries to prevent unbounded array growth
    const bounded = recentAttempts.slice(-options.maxAttempts);
    txn.set(rateLimitRef, { attempts: bounded, updatedAt: FieldValue.serverTimestamp() });
  });
}

// Convenience wrappers with preset configs
export function checkPairingCodeRateLimit(db: Firestore, uid: string): Promise<void> {
  return checkRateLimit(db, uid, {
    docKeyPrefix: 'pairingCode',
    maxAttempts: 5,
    windowMs: 10 * 60 * 1000,
    errorMessage: 'Too many pairing attempts. Please wait 10 minutes before trying again.',
  });
}

/**
 * Rate limit PIN verification by IP address. IP-based because anonymous auth
 * allows unlimited UIDs. No global bucket — it would be a DoS vector since
 * any anonymous user could exhaust it and lock out legitimate admins.
 */
export async function checkPinVerifyRateLimit(db: Firestore, callerIp: string): Promise<void> {
  // Sanitize IP for use as Firestore doc ID (replace dots/colons)
  const sanitizedIp = callerIp.replace(/[.:]/g, '_');
  await checkRateLimit(db, sanitizedIp, {
    docKeyPrefix: 'pinVerifyIp',
    maxAttempts: 5,
    windowMs: 5 * 60 * 1000,
    errorMessage: 'Too many PIN attempts. Please wait 5 minutes before trying again.',
  });
}

export function checkJwtRateLimit(db: Firestore, uid: string): Promise<void> {
  return checkRateLimit(db, uid, {
    docKeyPrefix: 'jitsiJwt',
    maxAttempts: 5,
    windowMs: 60 * 1000,
    errorMessage: 'Too many call attempts. Please wait a minute before trying again.',
  });
}

// ---------------------------------------------------------------------------
// Server-side PIN hashing (mirrors src/utils/pinHash.ts)
// ---------------------------------------------------------------------------
const APP_SALT = 'easycall-pin-v1';

function hashPinSync(pin: string, userId?: string): string {
  return crypto
    .createHash('sha256')
    .update(APP_SALT + (userId ?? '') + pin)
    .digest('hex');
}

function verifyPinSync(pin: string, storedHash: string, userId?: string): boolean {
  if (userId) {
    if (hashPinSync(pin, userId) === storedHash) return true;
  }
  // Legacy fallback (unsalted hash)
  return (
    crypto
      .createHash('sha256')
      .update(APP_SALT + pin)
      .digest('hex') === storedHash
  );
}

// ---------------------------------------------------------------------------
// verifyCaregiverPin
//
// Server-side PIN verification. Reads the hash from config/caregiverPinHash
// (not accessible to clients) and compares securely. Rate limited.
// ---------------------------------------------------------------------------
export const verifyCaregiverPin = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const data = extractData(request);
  const { pin } = data as { pin?: unknown };

  if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
    throw new HttpsError('invalid-argument', 'pin must be a 4-8 digit numeric string.');
  }

  const db = getFirestore();
  const callerIp =
    request.rawRequest?.ip ??
    request.rawRequest?.headers['x-forwarded-for']?.toString() ??
    'unknown';
  await checkPinVerifyRateLimit(db, callerIp);

  const pinHashDoc = await db.doc('config/caregiverPinHash').get();
  const storedHash = pinHashDoc.data()?.['pinHash'] as string | undefined;

  if (typeof storedHash !== 'string') {
    return { valid: false };
  }

  const valid = verifyPinSync(pin, storedHash, 'caregiver-instance');
  return { valid };
});

// ---------------------------------------------------------------------------
// Helper: verify caller has admin role via admin SDK (not client-writable role)
// ---------------------------------------------------------------------------
async function requireCaregiver(db: Firestore, uid: string): Promise<void> {
  const userDoc = await db.doc(`users/${uid}`).get();
  if (!userDoc.exists || userDoc.data()?.['role'] !== 'caregiver') {
    throw new HttpsError('permission-denied', 'Only caregivers can perform this action.');
  }
}

// ---------------------------------------------------------------------------
// setRegistrationLock
//
// Toggles registration open/closed. Server-side role verification.
// ---------------------------------------------------------------------------
export const setRegistrationLock = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const data = extractData(request);
  const { locked } = data as { locked?: unknown };

  if (typeof locked !== 'boolean') {
    throw new HttpsError('invalid-argument', 'locked must be a boolean.');
  }

  const db = getFirestore();
  await requireCaregiver(db, request.auth.uid);

  await db.doc('config/registration').set({
    open: !locked,
  });

  return { success: true };
});

// ---------------------------------------------------------------------------
// setCaregiverPinConfig
//
// Sets or removes the admin PIN. Server-side role verification.
// Writes to both config/caregiverPin (public flag) and config/caregiverPinHash
// (private hash) atomically.
// ---------------------------------------------------------------------------
export const setCaregiverPinConfig = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const data = extractData(request);
  const { pin, remove } = data as { pin?: unknown; remove?: unknown };

  if (remove === true) {
    // Remove PIN
    const db = getFirestore();
    await requireCaregiver(db, request.auth.uid);

    const batch = db.batch();
    batch.set(db.doc('config/caregiverPinHash'), { pinHash: null, setBy: null });
    batch.set(db.doc('config/caregiverPinStatus'), { pinSet: false });
    await batch.commit();

    return { success: true };
  }

  // Set PIN
  if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
    throw new HttpsError('invalid-argument', 'pin must be a 4-8 digit numeric string.');
  }

  const db = getFirestore();
  await requireCaregiver(db, request.auth.uid);

  const hash = hashPinSync(pin, 'caregiver-instance');
  const batch = db.batch();
  batch.set(db.doc('config/caregiverPinHash'), { pinHash: hash, setBy: request.auth.uid });
  batch.set(db.doc('config/caregiverPinStatus'), { pinSet: true });
  await batch.commit();

  return { success: true };
});

// ---------------------------------------------------------------------------
// assignCaregiverRole
//
// Assigns the admin (caregiver) role to a user. Client-side Firestore rules only allow
// creating user docs with role: 'elderly', so admin role assignment must go
// through this server-side function. Only sets the role if no role exists yet.
// ---------------------------------------------------------------------------
export const assignCaregiverRole = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const db = getFirestore();
  const uid = request.auth.uid;

  // Check registration lock
  const regDoc = await db.doc('config/registration').get();
  if (regDoc.exists && regDoc.data()?.['open'] === false) {
    throw new HttpsError('permission-denied', 'Registration is currently closed.');
  }

  // Verify admin PIN if one is configured
  const pinHashDoc = await db.doc('config/caregiverPinHash').get();
  const storedHash = pinHashDoc.data()?.['pinHash'] as string | undefined;
  if (typeof storedHash === 'string') {
    const data = extractData(request);
    const { pin } = data as { pin?: unknown };
    if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
      throw new HttpsError('invalid-argument', 'Caregiver PIN is required.');
    }
    const callerIp =
      request.rawRequest?.ip ??
      request.rawRequest?.headers['x-forwarded-for']?.toString() ??
      'unknown';
    await checkPinVerifyRateLimit(db, callerIp);
    if (!verifyPinSync(pin, storedHash, 'caregiver-instance')) {
      throw new HttpsError('permission-denied', 'Incorrect PIN.');
    }
  }

  const userRef = db.doc(`users/${uid}`);
  const userDoc = await userRef.get();

  if (userDoc.exists && userDoc.data()?.['role']) {
    throw new HttpsError('already-exists', 'User already has a role assigned.');
  }

  await userRef.set({ role: 'caregiver', onboardingComplete: false }, { merge: true });

  return { success: true };
});

export const validatePairingCode = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const data = extractData(request);
  const { code } = data as { code?: unknown };

  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'code must be a 6-digit numeric string.');
  }

  const caregiverUid = request.auth.uid;
  const db = getFirestore();

  // Only users with the admin role can redeem pairing codes.
  // Without this check any authenticated user (anonymous or member) could
  // self-grant admin access to another user's account.
  await requireCaregiver(db, caregiverUid);

  // Rate limit: max 5 attempts per 10-minute window
  await checkPairingCodeRateLimit(db, caregiverUid);

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

    // Also persist the link on the admin's own user doc so the
    // Dashboard can list all linked members without a collectionGroup query.
    const caregiverUserRef = db.collection('users').doc(caregiverUid);
    txn.set(
      caregiverUserRef,
      { linkedElderlyUsers: FieldValue.arrayUnion(elderlyUserId) },
      { merge: true },
    );

    return { elderlyUserId };
  });
});

// ---------------------------------------------------------------------------
// unlinkElderlyUser
//
// Called by the caregiver dashboard to unlink a member and reset their account.
// Atomically removes the caregiver link from both sides, deletes all member
// data (contacts, call history, active/incoming calls), resets settings to
// defaults, and writes an audit log entry.
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  fontSize: 'large',
  highContrast: false,
  ringtoneVolume: 80,
  autoAnswer: false,
  appLockEnabled: false,
  appLockPinHash: null,
  language: 'en',
};

async function deleteSubcollectionDocs(
  db: Firestore,
  parentPath: string,
  subcollection: string,
): Promise<FirebaseFirestore.DocumentReference[]> {
  const snap = await db.collection(`${parentPath}/${subcollection}`).get();
  return snap.docs.map((d) => d.ref);
}

/**
 * Add the critical unlink operations to a batch: remove all caregiver links,
 * clear active/incoming calls, reset user doc to defaults, and write audit log.
 */
function addCriticalUnlinkOps(
  batch: FirebaseFirestore.WriteBatch,
  db: Firestore,
  userPath: string,
  elderlyUserId: string,
  caregiverUid: string,
  elderlyDisplayName: string,
  allCaregiverRefs: FirebaseFirestore.DocumentReference[],
): void {
  for (const cgRef of allCaregiverRefs) {
    batch.delete(cgRef);
    batch.set(
      db.collection('users').doc(cgRef.id),
      { linkedElderlyUsers: FieldValue.arrayRemove(elderlyUserId) },
      { merge: true },
    );
  }
  batch.delete(db.doc(`${userPath}/activeCall/current`));
  batch.delete(db.doc(`${userPath}/incomingCall/current`));
  batch.set(
    db.doc(userPath),
    { settings: DEFAULT_SETTINGS, displayName: '', onboardingComplete: false, pushTokens: [] },
    { merge: true },
  );
  batch.set(db.collection('auditLog').doc(), {
    action: 'unlink_elderly_user',
    caregiverUid,
    elderlyUserId,
    elderlyDisplayName,
    timestamp: FieldValue.serverTimestamp(),
  });
}

export const unlinkElderlyUser = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const data = extractData(request);
  const { elderlyUserId } = data as { elderlyUserId?: unknown };

  if (typeof elderlyUserId !== 'string' || !elderlyUserId) {
    throw new HttpsError('invalid-argument', 'elderlyUserId is required.');
  }

  const caregiverUid = request.auth.uid;
  const db = getFirestore();

  // Verify role and linkage in parallel
  const [, linkDoc, elderlyDoc] = await Promise.all([
    requireCaregiver(db, caregiverUid),
    db.collection('users').doc(elderlyUserId).collection('caregivers').doc(caregiverUid).get(),
    db.doc(`users/${elderlyUserId}`).get(),
  ]);

  if (!linkDoc.exists) {
    throw new HttpsError('not-found', 'You are not linked to this member.');
  }

  const elderlyDisplayName =
    typeof elderlyDoc.data()?.['displayName'] === 'string'
      ? (elderlyDoc.data()!['displayName'] as string)
      : '';

  const userPath = `users/${elderlyUserId}`;

  // Fetch all subcollection docs and outstanding pairing codes in parallel
  const [contactRefs, historyRefs, allCaregiverRefs, pairingCodeRefs] = await Promise.all([
    deleteSubcollectionDocs(db, userPath, 'contacts'),
    deleteSubcollectionDocs(db, userPath, 'callHistory'),
    // Fetch ALL caregiver links — a member may have multiple caregivers.
    // We must remove every link so no caregiver retains a dangling reference.
    deleteSubcollectionDocs(db, userPath, 'caregivers'),
    // Invalidate outstanding pairing codes so they can't re-link the reset account.
    db
      .collection('pairingCodes')
      .where('elderlyUserId', '==', elderlyUserId)
      .get()
      .then((snap) => snap.docs.map((d) => d.ref)),
  ]);

  const allRefs = [...contactRefs, ...historyRefs, ...pairingCodeRefs];
  // Each caregiver = 2 ops (delete + arrayRemove set). Fixed ops = 4 (activeCall,
  // incomingCall, reset user doc, audit log). Caregiver delete refs are separate.
  const criticalOps = allCaregiverRefs.length * 2 + 4;
  const BATCH_LIMIT = 490;

  if (allRefs.length + criticalOps <= BATCH_LIMIT) {
    const batch = db.batch();
    addCriticalUnlinkOps(
      batch,
      db,
      userPath,
      elderlyUserId,
      caregiverUid,
      elderlyDisplayName,
      allCaregiverRefs,
    );
    for (const ref of allRefs) {
      batch.delete(ref);
    }
    await batch.commit();
  } else {
    // Commit critical operations first (unlink, reset, audit) so a later
    // failure only leaves orphaned subcollection docs — not deleted data
    // with intact caregiver links.
    const criticalBatch = db.batch();
    addCriticalUnlinkOps(
      criticalBatch,
      db,
      userPath,
      elderlyUserId,
      caregiverUid,
      elderlyDisplayName,
      allCaregiverRefs,
    );
    await criticalBatch.commit();

    // Best-effort cleanup — failures are swallowed because the unlink already
    // succeeded and orphaned docs are inaccessible (security rules require a link).
    for (let i = 0; i < allRefs.length; i += BATCH_LIMIT) {
      const chunk = allRefs.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const ref of chunk) {
        batch.delete(ref);
      }
      try {
        await batch.commit();
      } catch {
        // nosemgrep: no-console-log-sensitive — logs userId and batch index, not PII
        console.error(
          `Best-effort cleanup batch ${i / BATCH_LIMIT + 1} failed for user ${elderlyUserId}`,
        );
      }
    }
  }

  return { success: true };
});

// ---------------------------------------------------------------------------
// generateJitsiJwt
//
// Issues a JaaS JWT only after verifying the requesting user is a legitimate
// participant in the room (the member, the contact, or a linked admin).
// P0-2: moderator is boolean false — never a string.
// P0-3: room ownership is verified via a collectionGroup query before signing.
// ---------------------------------------------------------------------------
export const generateJitsiJwt = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const uid = request.auth.uid;
  const db = getFirestore();

  // Reject users who haven't completed role selection — they have no contacts
  // and no legitimate reason to request a JWT. Reduces attack surface.
  const userDoc = await db.doc(`users/${uid}`).get();
  if (!userDoc.exists || !userDoc.data()?.['role']) {
    throw new HttpsError('permission-denied', 'Account setup incomplete.');
  }

  await checkJwtRateLimit(db, uid);

  const requestData = extractData(request);
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

  // Look up room ownership from the roomOwners index (O(1) single doc read).
  // Falls back to collectionGroup scan for pre-existing contacts that haven't
  // been backfilled yet. The fallback also lazily populates the index.
  let participants: Participant[];

  const roomDoc = await db.collection('roomOwners').doc(roomName).get();
  if (roomDoc.exists) {
    participants = (roomDoc.data()!['participants'] ?? []) as Participant[];
  } else {
    // Fallback: collectionGroup scan for rooms created before onContactWritten
    const contactsSnap = await db
      .collectionGroup('contacts')
      .where('jitsiRoomId', '==', roomName)
      .get();

    if (contactsSnap.empty) {
      throw new HttpsError('not-found', 'Room not found.');
    }

    // Build participants from contact docs and lazily populate roomOwners
    participants = [];
    for (const contactDoc of contactsSnap.docs) {
      const ownerUserId = contactDoc.ref.parent.parent!.id;
      const contactUserId = (contactDoc.data()['contactUserId'] as string) ?? null;
      participants.push({ userId: ownerUserId, role: 'owner' });
      if (contactUserId) {
        participants.push({ userId: contactUserId, role: 'contact' });
      }
    }
    // Lazily backfill the index so future calls use the fast path
    await db
      .collection('roomOwners')
      .doc(roomName)
      .set(
        {
          participants: FieldValue.arrayUnion(...participants),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  }

  // Check if the caller is a direct participant or a linked caregiver.
  let authorized = false;
  for (const p of participants) {
    if (p.userId === uid) {
      authorized = true;
      break;
    }
    const caregiverDoc = await db.doc(`users/${p.userId}/caregivers/${uid}`).get();
    if (caregiverDoc.exists) {
      authorized = true;
      break;
    }
  }

  if (!authorized) {
    throw new HttpsError('permission-denied', 'Not a participant in this room.');
  }

  const appId = process.env['JAAS_APP_ID'];
  const keyId = process.env['JAAS_KEY_ID'];
  // Normalize escaped "\n" sequences that Cloud Functions env vars commonly
  // contain when set via the CLI or Secret Manager, as they break PEM parsing.
  const privateKey = process.env['JAAS_PRIVATE_KEY']?.replace(/\\n/g, '\n');

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
// Sends an FCM push notification to all of the member's registered
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
    const rawTokens: unknown = elderlyDoc.data()?.['pushTokens'] ?? [];

    if (!Array.isArray(rawTokens) || !rawTokens.every((t) => typeof t === 'string')) {
      // nosemgrep: no-console-log-sensitive — logs type validation error, not token values
      console.warn(
        `pushTokens for user ${event.params['elderlyUserId']} is not a string array; skipping FCM send.`,
      );
      return;
    }

    const pushTokens: string[] = rawTokens;

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
      // nosemgrep: no-console-log-sensitive — logs token count, not token values
      console.log(
        `Removing ${staleTokens.length} stale FCM token(s) for user ${event.params['elderlyUserId']}`,
      );
      await db
        .doc(`users/${event.params['elderlyUserId']}`)
        .update({ pushTokens: FieldValue.arrayRemove(...staleTokens) });
    }

    if (totalFails > 0) {
      // nosemgrep: no-console-log-sensitive — logs failure count, not token values
      console.error(
        `FCM: ${totalFails} of ${pushTokens.length} sends failed for user ${event.params['elderlyUserId']}`,
      );
    }
  },
);

// ---------------------------------------------------------------------------
// writeCallHistoryForMissedOrDeclined (exported for testing)
//
// Core logic for the onCallStatusChange trigger. Extracted so it can be
// unit-tested without mocking the Cloud Functions trigger harness.
// ---------------------------------------------------------------------------
export async function writeCallHistoryForMissedOrDeclined(
  db: Firestore,
  elderlyUserId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): Promise<boolean> {
  if (!after) return false; // doc deleted

  const status = after['status'] as string;
  if (status !== 'missed' && status !== 'declined') return false;
  if (before && before['status'] === status) return false;

  const timestamp = after['timestamp'] as FirebaseFirestore.Timestamp | undefined;
  const now = FieldValue.serverTimestamp();

  const callerName = String(after['callerName'] ?? 'Unknown').slice(0, 100);

  await db
    .collection('users')
    .doc(elderlyUserId)
    .collection('callHistory')
    .add({
      contactId: '',
      contactName: callerName,
      direction: 'incoming' as const,
      outcome: status,
      duration: 0,
      startedAt: timestamp ?? now,
      endedAt: now,
    });

  return true;
}

// ---------------------------------------------------------------------------
// onCallStatusChange
//
// Triggers when incomingCall/current is updated. When the status transitions
// to 'missed' or 'declined', writes a callHistory entry for the member.
// Completed calls are written client-side (CallScreen has accurate duration).
// ---------------------------------------------------------------------------
export const onCallStatusChange = onDocumentWritten(
  'users/{elderlyUserId}/incomingCall/current',
  async (event) => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();
    const elderlyUserId = event.params['elderlyUserId'];
    const db = getFirestore();

    await writeCallHistoryForMissedOrDeclined(db, elderlyUserId, before, after);
  },
);

// ---------------------------------------------------------------------------
// handleStatusChange (exported for testing)
//
// Core logic for the onUserStatusChanged trigger. Syncs RTDB presence state
// to Firestore and sends missed call notifications on offline → online.
// ---------------------------------------------------------------------------

const VALID_PRESENCE_STATES = ['online', 'in-call', 'offline'] as const;
type PresenceState = (typeof VALID_PRESENCE_STATES)[number];

export function isValidPresenceState(s: string): s is PresenceState {
  return (VALID_PRESENCE_STATES as readonly string[]).includes(s);
}

export async function handleStatusChange(
  db: Firestore,
  uid: string,
  beforeState: string | null,
  afterState: string,
  lastChanged: number | null,
): Promise<void> {
  // Read user doc first — needed for missed call notifications and avoids
  // a redundant second read in sendMissedCallNotifications
  const userSnap = await db.doc(`users/${uid}`).get();

  const updateData: Record<string, unknown> = { presenceState: afterState };

  if (afterState === 'offline' && lastChanged) {
    updateData['lastSeen'] = Timestamp.fromMillis(lastChanged);
  }

  await db.doc(`users/${uid}`).set(updateData, { merge: true });

  // Missed call notification on offline → online transition
  if (afterState === 'online' && (beforeState === 'offline' || beforeState === null)) {
    await sendMissedCallNotifications(db, uid, userSnap);
  }
}

async function sendMissedCallNotifications(
  db: Firestore,
  uid: string,
  userSnap: FirebaseFirestore.DocumentSnapshot,
): Promise<void> {
  if (!userSnap.exists) return;

  const userData = userSnap.data()!;
  const lastSeen = userData['lastSeen'] as FirebaseFirestore.Timestamp | undefined;
  const pushTokens: string[] = Array.isArray(userData['pushTokens'])
    ? (userData['pushTokens'] as string[])
    : [];

  if (pushTokens.length === 0) return;

  let missedQuery = db
    .collection('users')
    .doc(uid)
    .collection('callHistory')
    .where('outcome', 'in', ['missed', 'declined'])
    .orderBy('startedAt', 'desc')
    .limit(10);

  if (lastSeen) {
    missedQuery = missedQuery.where('startedAt', '>', lastSeen);
  }

  const missedSnap = await missedQuery.get();
  if (missedSnap.empty) return;

  const missedCount = missedSnap.size;
  const callerNames = [
    ...new Set(missedSnap.docs.map((d) => String(d.data()['contactName'] ?? 'Unknown'))),
  ];
  const summary =
    missedCount === 1
      ? `Missed call from ${String(missedSnap.docs[0]!.data()['contactName'] ?? 'Unknown')}`
      : `${missedCount} missed calls from ${callerNames.join(', ')}`;

  await getMessaging().sendEachForMulticast({
    tokens: pushTokens,
    notification: {
      title: 'Missed Call',
      body: summary,
    },
    data: { type: 'missed_calls' },
    android: { priority: 'normal' as const },
    webpush: { headers: { Urgency: 'normal' } },
  });
}

// ---------------------------------------------------------------------------
// onDisplayNameChanged (exported for testing)
//
// Core logic for the onUserProfileChanged trigger. When a user's displayName
// changes, updates all contact documents that reference this user via
// contactUserId so elderly HomeScreens show the current name.
// ---------------------------------------------------------------------------
export async function syncDisplayNameToContacts(
  db: Firestore,
  uid: string,
  beforeName: string | undefined,
  afterName: string | undefined,
): Promise<number> {
  if (!afterName || afterName === beforeName) return 0;

  // Find all contacts across all users that reference this UID
  const contactsSnap = await db.collectionGroup('contacts').where('contactUserId', '==', uid).get();

  if (contactsSnap.empty) return 0;

  const batch = db.batch();
  let count = 0;
  for (const contactDoc of contactsSnap.docs) {
    if (contactDoc.data()['name'] !== afterName) {
      batch.update(contactDoc.ref, { name: afterName });
      count++;
    }
  }

  if (count > 0) await batch.commit();
  return count;
}

// ---------------------------------------------------------------------------
// onUserProfileChanged
//
// Triggers when a user document is updated. If displayName changed,
// propagates the new name to all contact docs referencing this user.
// ---------------------------------------------------------------------------
export const onUserProfileChanged = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after) return; // doc deleted

  const beforeName = before?.['displayName'] as string | undefined;
  const afterName = after['displayName'] as string | undefined;

  if (!afterName || afterName === beforeName) return;

  const db = getFirestore();
  const uid = event.params['uid'];

  // Defense-in-depth: skip sync if this displayName was changed less than 30s
  // ago (primary throttle is in Firestore rules). Prevents cascade if rules
  // are bypassed (e.g., via admin SDK or a bug).
  const rateLimitRef = db.collection('rateLimits').doc(`displayNameSync:${uid}`);
  const rateLimitSnap = await rateLimitRef.get();
  const lastSync = rateLimitSnap.data()?.['lastSync'] as Timestamp | undefined;
  if (lastSync && Date.now() - lastSync.toMillis() < 30_000) {
    return;
  }

  const count = await syncDisplayNameToContacts(db, uid, beforeName, afterName);

  if (count > 0) {
    // nosemgrep: no-console-log-sensitive — logs count, not name value
    console.log(`Updated ${count} contact(s) with new displayName for user ${uid}`);
  }

  await rateLimitRef.set({ lastSync: FieldValue.serverTimestamp() });
});

// ---------------------------------------------------------------------------
// onUserStatusChanged
//
// Triggers when RTDB /status/{uid} is written. Mirrors presence state to
// Firestore and sends missed call notifications when users come back online.
// ---------------------------------------------------------------------------
export const onUserStatusChanged = onValueWritten('/status/{uid}', async (event) => {
  const uid = event.params.uid;
  const before = event.data.before.val() as { state?: string } | null;
  const after = event.data.after.val() as { state?: string; lastChanged?: number } | null;
  if (!after || typeof after !== 'object') return;

  const afterState = after.state as string;
  if (!isValidPresenceState(afterState)) return;

  const beforeState = before && typeof before === 'object' ? (before.state as string) : null;

  await handleStatusChange(getFirestore(), uid, beforeState, afterState, after.lastChanged ?? null);
});

// ---------------------------------------------------------------------------
// Room ownership index helpers
//
// Maintains roomOwners/{jitsiRoomId} documents so generateJitsiJwt can
// verify room access with a single doc read instead of a collectionGroup scan.
// ---------------------------------------------------------------------------
interface Participant {
  userId: string;
  role: string;
}

function buildParticipants(ownerUserId: string, contactUserId: string | null): Participant[] {
  const list: Participant[] = [{ userId: ownerUserId, role: 'owner' }];
  if (contactUserId) list.push({ userId: contactUserId, role: 'contact' });
  return list;
}

async function addToRoomOwners(
  db: Firestore,
  roomId: string,
  ownerUserId: string,
  contactUserId: string | null,
): Promise<void> {
  const ref = db.collection('roomOwners').doc(roomId);
  await ref.set(
    {
      participants: FieldValue.arrayUnion(...buildParticipants(ownerUserId, contactUserId)),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function removeFromRoomOwners(
  db: Firestore,
  roomId: string,
  ownerUserId: string,
  contactUserId: string | null,
): Promise<void> {
  const ref = db.collection('roomOwners').doc(roomId);
  try {
    await ref.update({
      participants: FieldValue.arrayRemove(...buildParticipants(ownerUserId, contactUserId)),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Document may not exist (already cleaned up or data inconsistency).
    // Swallow NOT_FOUND to prevent infinite Cloud Function retries.
    if (err instanceof Error && err.message.includes('NOT_FOUND')) return;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// onContactWritten
//
// Maintains the roomOwners index when contacts are created, updated, or deleted.
// ---------------------------------------------------------------------------
export const onContactWritten = onDocumentWritten(
  'users/{userId}/contacts/{contactId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const userId = event.params['userId'];
    const db = getFirestore();

    const beforeRoomId = before?.['jitsiRoomId'] as string | undefined;
    const afterRoomId = after?.['jitsiRoomId'] as string | undefined;
    const beforeContactUserId = (before?.['contactUserId'] as string) ?? null;
    const afterContactUserId = (after?.['contactUserId'] as string) ?? null;

    // Deletion
    if (!after && beforeRoomId) {
      await removeFromRoomOwners(db, beforeRoomId, userId, beforeContactUserId);
      return;
    }

    // Creation
    if (!before && afterRoomId) {
      await addToRoomOwners(db, afterRoomId, userId, afterContactUserId);
      return;
    }

    // Update — room ID or contactUserId changed
    if (before && after) {
      const roomChanged = beforeRoomId !== afterRoomId;
      const contactChanged = beforeContactUserId !== afterContactUserId;
      if (!roomChanged && !contactChanged) return;

      const ops: Promise<void>[] = [];
      if (beforeRoomId) {
        ops.push(removeFromRoomOwners(db, beforeRoomId, userId, beforeContactUserId));
      }
      if (afterRoomId) {
        ops.push(addToRoomOwners(db, afterRoomId, userId, afterContactUserId));
      }
      await Promise.all(ops);
    }
  },
);

// ---------------------------------------------------------------------------
// onBillingAlert
//
// Listens to the billing-alerts Pub/Sub topic. Writes the current spend to
// config/billingAlert so caregivers see it in real-time. When the budget
// threshold reaches 100%, also disables billing to prevent overspend.
// Re-enable billing manually in the Cloud Console when ready.
// ---------------------------------------------------------------------------
const BILLING_ACCOUNT = 'billingAccounts/01E5DE-2C7B58-EEC12F';
const PROJECT_ID = 'easycall-dev';

export interface BudgetNotification {
  costAmount: number;
  budgetAmount: number;
  budgetAmountType: string;
  alertThresholdExceeded?: number;
  costIntervalStart: string;
  currencyCode: string;
}

export const onBillingAlert: ReturnType<typeof onMessagePublished> = onMessagePublished(
  'billing-alerts',
  async (event) => {
    const data: BudgetNotification = event.data.message.json as BudgetNotification;

    if (data.alertThresholdExceeded == null) {
      // nosemgrep: no-console-log-sensitive — logs cost amount and currency, not secrets
      console.log(
        `Budget notification: ${data.costAmount} ${data.currencyCode} spent (no threshold exceeded). Skipping.`,
      );
      return;
    }

    const threshold = data.alertThresholdExceeded;
    const db = getFirestore();
    const alertRef = db.doc('config/billingAlert');

    // Transactional read-then-write: only overwrite if the new threshold
    // should win (different billing period, or same period with higher threshold).
    const written = await db.runTransaction(async (tx) => {
      const current = await tx.get(alertRef);
      if (current.exists) {
        const currentData = current.data()!;
        const currentThreshold = currentData['thresholdExceeded'] as number | undefined;
        const currentInterval = currentData['costIntervalStart'] as string | undefined;
        const samePeriod = currentInterval === data.costIntervalStart;

        if (samePeriod && currentThreshold != null && currentThreshold > threshold) {
          // nosemgrep: no-console-log-sensitive — logs threshold percentages and period, not secrets
          console.log(
            `Skipping threshold ${threshold}: current alert is already at ${currentThreshold} for period ${data.costIntervalStart}.`,
          );
          return false;
        }
      }

      tx.set(alertRef, {
        costAmount: data.costAmount,
        budgetAmount: data.budgetAmount,
        currencyCode: data.currencyCode,
        costIntervalStart: data.costIntervalStart,
        thresholdExceeded: threshold,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });

    if (!written) return;

    // nosemgrep: no-console-log-sensitive — logs cost amounts and threshold, not secrets
    console.log(
      `Budget alert: ${data.costAmount} ${data.currencyCode} of ${data.budgetAmount} ${data.currencyCode} (threshold: ${threshold}). Written to Firestore.`,
    );

    // Disable billing at 90% to account for the delay between actual spend
    // and budget alert delivery (can be 5-30 minutes).
    if (threshold >= 0.9) {
      // nosemgrep: no-console-log-sensitive — logs project ID, not secrets
      console.warn(
        `Budget threshold ${threshold} reached. Disabling billing for project ${PROJECT_ID}.`,
      );

      try {
        const { GoogleAuth } = await import('google-auth-library');
        const auth = new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/cloud-billing'],
        });
        const client = await auth.getClient();

        const res = await client.request({
          url: `https://cloudbilling.googleapis.com/v1/projects/${PROJECT_ID}/billingInfo`,
          method: 'PUT',
          data: { billingAccountName: '' },
        });

        if (res.status === 200) {
          // nosemgrep: no-console-log-sensitive — logs project ID and billing account, not secrets
          console.warn(`Billing disabled for project ${PROJECT_ID} via ${BILLING_ACCOUNT}.`);
        } else {
          // nosemgrep: no-console-log-sensitive — logs HTTP status and response body for debugging
          console.error(`Failed to disable billing: ${res.status} ${JSON.stringify(res.data)}`);
        }
      } catch (err) {
        // nosemgrep: no-console-log-sensitive — logs project ID and error for debugging
        console.error(
          `Error disabling billing for project ${PROJECT_ID} (account ${BILLING_ACCOUNT}):`, // nosemgrep: unsafe-formatstring
          err,
        );
      }
    }
  },
);

// ---------------------------------------------------------------------------
// generateDirectLink
//
// Creates a direct call link for restricted network users. The link embeds
// a long-lived JWT so the restricted user's browser never contacts Firebase.
// ---------------------------------------------------------------------------
export const generateDirectLink = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const db = getFirestore();
  const uid = request.auth.uid;
  await requireCaregiver(db, uid);

  const data = extractData(request);
  const { elderlyUserId, contactId, callerDisplayName } = data as {
    elderlyUserId?: unknown;
    contactId?: unknown;
    callerDisplayName?: unknown;
  };

  if (typeof elderlyUserId !== 'string' || !elderlyUserId) {
    throw new HttpsError('invalid-argument', 'elderlyUserId is required.');
  }
  if (typeof contactId !== 'string' || !contactId) {
    throw new HttpsError('invalid-argument', 'contactId is required.');
  }
  if (typeof callerDisplayName !== 'string' || !callerDisplayName.trim()) {
    throw new HttpsError('invalid-argument', 'callerDisplayName is required.');
  }

  // Verify caregiver is linked to this elderly user
  const linkDoc = await db
    .collection('users')
    .doc(elderlyUserId)
    .collection('caregivers')
    .doc(uid)
    .get();
  if (!linkDoc.exists) {
    throw new HttpsError('permission-denied', 'Not linked to this member.');
  }

  // Verify contact exists under the elderly user
  const contactDoc = await db
    .collection('users')
    .doc(elderlyUserId)
    .collection('contacts')
    .doc(contactId)
    .get();
  if (!contactDoc.exists) {
    throw new HttpsError('not-found', 'Contact not found.');
  }

  const contactData = contactDoc.data()!;
  const contactName = (contactData['name'] as string) ?? 'Contact';
  const contactUserId = (contactData['contactUserId'] as string) ?? '';

  // Generate unique link ID and room ID
  const linkId = crypto.randomBytes(9).toString('base64url');
  const roomId = `easycall-direct-${linkId}`;

  // Sign a 30-day JWT
  const appId = process.env['JAAS_APP_ID'];
  const keyId = process.env['JAAS_KEY_ID'];
  const privateKey = process.env['JAAS_PRIVATE_KEY']?.replace(/\\n/g, '\n');

  if (!privateKey || !appId || !keyId) {
    throw new HttpsError('internal', 'JaaS configuration is missing.');
  }

  const token = jwt.sign(
    {
      aud: 'jitsi',
      iss: 'chat',
      sub: appId,
      room: roomId,
      context: {
        user: {
          id: `direct-${linkId}`,
          name: callerDisplayName.trim(),
          moderator: false,
        },
      },
    },
    privateKey,
    {
      algorithm: 'RS256',
      header: { kid: keyId, typ: 'JWT', alg: 'RS256' },
      expiresIn: '30d',
    },
  );

  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000);

  // Write link metadata and room index atomically
  const batch = db.batch();
  batch.set(db.doc(`directLinks/${linkId}`), {
    linkId,
    roomId,
    elderlyUserId,
    contactUserId,
    contactName,
    callerDisplayName: callerDisplayName.trim(),
    createdBy: uid,
    createdAt: now,
    expiresAt,
    revoked: false,
    revokedAt: null,
  });
  batch.set(db.doc(`directLinksByRoom/${roomId}`), {
    linkId,
    contactUserId,
    elderlyUserId,
    callerDisplayName: callerDisplayName.trim(),
    revoked: false,
  });
  await batch.commit();

  // Build the URL — the fragment is never sent to the server
  const origin = process.env['APP_ORIGIN'] ?? 'https://easycall.web.app';
  const url = `${origin}/join#token=${token}&room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(contactName)}`;

  return { linkId, url };
});

// ---------------------------------------------------------------------------
// revokeDirectLink
//
// Marks a direct link as revoked. The JWT remains technically valid, but the
// webhook handler will not send notifications for revoked links.
// ---------------------------------------------------------------------------
export const revokeDirectLink = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const db = getFirestore();
  const uid = request.auth.uid;

  const data = extractData(request);
  const { linkId } = data as { linkId?: unknown };

  if (typeof linkId !== 'string' || !linkId) {
    throw new HttpsError('invalid-argument', 'linkId is required.');
  }

  const linkDoc = await db.doc(`directLinks/${linkId}`).get();
  if (!linkDoc.exists) {
    throw new HttpsError('not-found', 'Link not found.');
  }

  if (linkDoc.data()!['createdBy'] !== uid) {
    throw new HttpsError('permission-denied', 'Only the link creator can revoke it.');
  }

  const roomId = linkDoc.data()!['roomId'] as string;
  const now = FieldValue.serverTimestamp();

  const batch = db.batch();
  batch.update(db.doc(`directLinks/${linkId}`), { revoked: true, revokedAt: now });
  batch.update(db.doc(`directLinksByRoom/${roomId}`), { revoked: true });
  await batch.commit();

  return { success: true };
});

// ---------------------------------------------------------------------------
// onJaasWebhook
//
// HTTP endpoint that receives JaaS webhook events. When a participant joins
// a direct-link room, notifies the designated contact via the existing
// incoming call signaling mechanism (Firestore doc + FCM push).
// ---------------------------------------------------------------------------
export function verifyJaasWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export async function handleJaasParticipantJoined(
  db: Firestore,
  roomId: string,
  participantName: string,
): Promise<boolean> {
  // Only process direct-link rooms
  if (!roomId.startsWith('easycall-direct-')) return false;

  const roomDoc = await db.doc(`directLinksByRoom/${roomId}`).get();
  if (!roomDoc.exists) return false;

  const roomData = roomDoc.data()!;
  if (roomData['revoked'] === true) return false;

  const contactUserId = roomData['contactUserId'] as string;
  const callerDisplayName = (roomData['callerDisplayName'] as string) || participantName;

  // Write incoming call signaling doc (same mechanism as initiateCall)
  await db.doc(`users/${contactUserId}/incomingCall/current`).set({
    callerId: `direct-link`,
    callerName: callerDisplayName,
    callerPhotoURL: '',
    jitsiRoomId: roomId,
    status: 'ringing',
    timestamp: FieldValue.serverTimestamp(),
  });

  // Send FCM push notification
  const userDoc = await db.doc(`users/${contactUserId}`).get();
  const rawTokens: unknown = userDoc.data()?.['pushTokens'] ?? [];
  if (!Array.isArray(rawTokens) || rawTokens.length === 0) return true;

  const pushTokens = rawTokens.filter((t): t is string => typeof t === 'string');
  if (pushTokens.length === 0) return true;

  await getMessaging().sendEachForMulticast({
    tokens: pushTokens,
    data: {
      type: 'incoming_call',
      callerName: callerDisplayName,
      callerPhoto: '',
      roomId,
      elderlyUserId: roomData['elderlyUserId'] as string,
    },
    android: { priority: 'high' as const, ttl: 60_000 },
    webpush: {
      headers: { Urgency: 'high' },
      fcmOptions: { link: `/call-room/${roomId}` },
    },
  });

  return true;
}

export const onJaasWebhook = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const secret = process.env['JAAS_WEBHOOK_SECRET'];
  if (secret) {
    // Use rawBody (the exact bytes from the HTTP request) for HMAC verification.
    // JSON.stringify(req.body) can produce different formatting than what JaaS signed.
    const rawBody = req.rawBody?.toString('utf-8') ?? '';
    const signature = req.headers['x-webhook-signature'] as string | undefined;
    if (!verifyJaasWebhookSignature(rawBody, signature, secret)) {
      res.status(401).send('Invalid signature');
      return;
    }
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const eventType = body?.['eventType'] as string | undefined;

  if (eventType !== 'PARTICIPANT_JOINED') {
    res.status(200).send('OK');
    return;
  }

  const conference = (body?.['data']?.['conference'] as string) ?? '';
  // Format: roomname@conference.appId.8x8.vc — extract roomname
  const roomId = conference.split('@')[0] ?? '';
  const participantName = (body?.['data']?.['name'] as string) ?? 'Someone';

  try {
    const db = getFirestore();
    await handleJaasParticipantJoined(db, roomId, participantName);
  } catch (err) {
    // nosemgrep: no-console-log-sensitive, unsafe-formatstring — logs room ID and error, not user data
    console.error(`Error handling JaaS webhook for room ${roomId}:`, err); // nosemgrep: unsafe-formatstring
  }

  // Always return 200 to prevent JaaS retries
  res.status(200).send('OK');
});
