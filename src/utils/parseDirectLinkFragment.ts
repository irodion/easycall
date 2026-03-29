export interface DirectLinkParams {
  token: string;
  room: string;
  name: string;
}

/**
 * Parses the URL fragment for a direct call link.
 * Expected format: #token=eyJ...&room=easycall-direct-abc123&name=Grandma
 * Returns null if required params (token, room) are missing.
 */
export function parseDirectLinkFragment(hash: string): DirectLinkParams | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!fragment) return null;

  const params = new URLSearchParams(fragment);
  const token = params.get('token');
  const room = params.get('room');
  const name = params.get('name') ?? '';

  if (!token || !room) return null;

  // URLSearchParams.get() already decodes percent-encoded values — do not
  // call decodeURIComponent again or names containing literal '%' will throw.
  return { token, room, name };
}
