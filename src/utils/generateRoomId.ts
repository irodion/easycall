// Deterministic room ID for a pair of linked users. Sorting UIDs ensures
// the same pair always produces the same room regardless of who was added first,
// so Alice→Bob and Bob→Alice share a single Jitsi room.
export function generateLinkedRoomId(uid1: string, uid2: string): string {
  const [a, b] = [uid1, uid2].sort();
  return `easycall-link-${a}-${b}`;
}
