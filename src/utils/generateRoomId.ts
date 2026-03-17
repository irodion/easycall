export function generateRoomId(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20);
  const safeLabel = sanitized || 'room';
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `easycall-${safeLabel}-${suffix}`;
}
