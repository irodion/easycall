const APP_SALT = 'easycall-pin-v1';

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(APP_SALT + pin);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  const hash = await hashPin(pin);
  return hash === storedHash;
}
