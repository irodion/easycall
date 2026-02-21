import { describe, it, expect } from 'vitest';
import { pwaManifest } from '../pwa-config';

describe('PWA Manifest', () => {
  it('has the correct app name', () => {
    expect(pwaManifest.name).toBe('EasyCall — Video Calling for Everyone');
  });

  it('has a short_name', () => {
    expect(pwaManifest.short_name).toBe('EasyCall');
  });

  it('starts from the root URL', () => {
    expect(pwaManifest.start_url).toBe('/');
  });

  it('runs in standalone display mode', () => {
    expect(pwaManifest.display).toBe('standalone');
  });

  it('uses portrait orientation', () => {
    expect(pwaManifest.orientation).toBe('portrait');
  });

  it('has a theme color', () => {
    expect(pwaManifest.theme_color).toBeDefined();
    expect(typeof pwaManifest.theme_color).toBe('string');
  });

  it('includes a 192x192 icon', () => {
    const icon192 = pwaManifest.icons?.find((i) => i.sizes === '192x192');
    expect(icon192).toBeDefined();
    expect(icon192?.type).toBe('image/png');
  });

  it('includes a 512x512 icon', () => {
    const icon512 = pwaManifest.icons?.find((i) => i.sizes === '512x512' && !i.purpose);
    expect(icon512).toBeDefined();
    expect(icon512?.type).toBe('image/png');
  });

  it('includes a maskable icon', () => {
    const maskable = pwaManifest.icons?.find((i) => i.purpose === 'maskable');
    expect(maskable).toBeDefined();
  });
});
