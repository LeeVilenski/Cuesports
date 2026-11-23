import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { host: true },
  // three.js is most of the bundle; it is precached for offline play.
  build: { chunkSizeWarningLimit: 900 },
  plugins: [
    VitePWA({
      registerType: 'prompt',
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
        // The sound effects are small and precached; the music (megabytes) is cached as each
        // track is first played, so it works offline from then on.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2,wav}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/music/') && url.pathname.endsWith('.mp3'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'music',
              expiration: { maxEntries: 12 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        navigateFallback: '/index.html',
        // The physics lab is a separate app under /lab/; the game's service worker must not
        // answer its navigations with the game's index.html.
        navigateFallbackDenylist: [/^\/lab\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
