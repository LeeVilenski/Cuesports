import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { host: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Cuesports',
        short_name: 'Cuesports',
        description: 'Snooker, English pool, 9-ball and 10-ball with realistic ball physics.',
        theme_color: '#10251b',
        background_color: '#0d1512',
        display: 'fullscreen',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        // The physics lab is a separate app under /lab/; the game's service worker must not
        // answer its navigations with the game's index.html.
        navigateFallbackDenylist: [/^\/lab\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
