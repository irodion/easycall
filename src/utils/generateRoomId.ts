// Room ID format: easycall-{label (≤20 chars)}-{12-char hex suffix}
// Label is sanitized (lowercase alphanumeric), falls back to "room" if empty.
// Total length ≤ 42 chars, well within Jitsi/JaaS limits.
export function generateRoomId(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20);
  const safeLabel = sanitized || 'room';
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `easycall-${safeLabel}-${suffix}`;
}

// Deterministic room ID for a pair of linked users. Sorting UIDs ensures
// the same pair always produces the same room regardless of who was added first,
// so Alice→Bob and Bob→Alice share a single Jitsi room.
export function generateLinkedRoomId(uid1: string, uid2: string): string {
  const [a, b] = [uid1, uid2].sort();
  return `easycall-link-${a}-${b}`;
}
