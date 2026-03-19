import type { ManifestOptions } from 'vite-plugin-pwa';

export const pwaManifest: Partial<ManifestOptions> = {
  name: 'EasyCall — Video Calling for Everyone',
  short_name: 'EasyCall',
  description: 'Simple video calling for elderly users',
  start_url: '/',
  display: 'standalone',
  orientation: 'portrait',
  theme_color: '#1a5276',
  background_color: '#fdf8f0',
  icons: [
    {
      src: '/pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: '/pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
    {
      src: '/pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};
