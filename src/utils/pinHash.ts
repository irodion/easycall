const APP_SALT = 'easycall-pin-v1';

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPin(pin: string, userId?: string): Promise<string> {
  return sha256(APP_SALT + (userId ?? '') + pin);
}

export async function verifyPin(
  pin: string,
  storedHash: string,
  userId?: string,
): Promise<boolean> {
  // Try with per-user salt first
  if (userId) {
    const saltedHash = await hashPin(pin, userId);
    if (saltedHash === storedHash) return true;
  }
  // Fallback: verify against legacy unsalted hash (migration path)
  const legacyHash = await sha256(APP_SALT + pin);
  return legacyHash === storedHash;
}
