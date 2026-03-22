import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onValueWritten } from 'firebase-functions/v2/database';
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

  // Fetch all subcollection docs in parallel
  const [contactRefs, historyRefs, allCaregiverRefs] = await Promise.all([
    deleteSubcollectionDocs(db, userPath, 'contacts'),
    deleteSubcollectionDocs(db, userPath, 'callHistory'),
    // Fetch ALL caregiver links — a member may have multiple caregivers.
    // We must remove every link so no caregiver retains a dangling reference.
    deleteSubcollectionDocs(db, userPath, 'caregivers'),
  ]);

  const allRefs = [...contactRefs, ...historyRefs];
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
      } catch (err) {
        console.error(`Best-effort cleanup batch failed for user ${elderlyUserId}:`, err);
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

  const requestData = typeof request.data === 'object' && request.data !== null ? request.data : {};
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

  // Multiple contacts can share a room ID (linked contacts: Alice→Bob and
  // Bob→Alice use the same deterministic room). Check if the caller is
  // authorized for ANY of the matching contact docs.
  let authorized = false;
  for (const contactDoc of contactsSnap.docs) {
    const contactData = contactDoc.data();
    // Path: users/{elderlyUserId}/contacts/{contactId}
    const elderlyUserId = contactDoc.ref.parent.parent!.id;

    if (uid === elderlyUserId) {
      authorized = true;
      break;
    }
    if (contactData['contactUserId'] != null && uid === contactData['contactUserId']) {
      authorized = true;
      break;
    }

    const caregiverDoc = await db
      .collection('users')
      .doc(elderlyUserId)
      .collection('caregivers')
      .doc(uid)
      .get();
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
  const count = await syncDisplayNameToContacts(db, uid, beforeName, afterName);

  if (count > 0) {
    // nosemgrep: no-console-log-sensitive — logs count, not name value
    console.log(`Updated ${count} contact(s) with new displayName for user ${uid}`);
  }
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
