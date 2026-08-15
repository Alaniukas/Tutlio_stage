import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage } from 'node:http';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Tutlio',
        short_name: 'Tutlio',
        description: 'For tutors and students to manage their time.',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache ONLY the SPA shell (content-hashed) + static assets.
        // Never pin index.html with a null Workbox revision: that treats the
        // shell as immutable, so after deploy the SW keeps an old HTML that
        // points at deleted /assets/main-*.js and users see a white screen.
        // Including index.html in globPatterns gives it a real revision each build.
        // Never glob all HTML or JS — that would pin every lazy route / marketing
        // HTML and download ~20 MB of private chunks on a marketing visit.
        globPatterns: ['index.html', '**/*.{css,ico,png,svg,woff2}'],
        // Locale-specific marketing screenshots are loaded responsively on the
        // feature page; precaching every language pair would add ~40 MB.
        globIgnores: ['landing/digital-business-card-*.png', 'preview-assign-student-modal.html'],
        maximumFileSizeToCacheInBytes: 7 * 1024 * 1024,
        navigateFallback: 'index.html',
        // SEO/crawler files must never be answered with the SPA shell from the SW.
        navigateFallbackDenylist: [/^\/api\//, /^\/(robots\.txt|sitemap\.xml|llms(-full)?\.txt)$/, /\/blog\/rss\.xml$/, /^\/preview-assign-student-modal\.html$/],
        importScripts: ['/push-sw.js'],
        runtimeCaching: [
          // Cache visited hashed chunks, but revalidate so a post-deploy shell
          // does not keep serving a permanently stale module graph.
          {
            urlPattern: /\/assets\/.*\.js$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'app-js',
              expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Storage object GET/POST must not be served stale from SW during whiteboard collaboration.
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\//i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-api', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      // Keep browser Host (e.g. localhost:3000) so API redirects use the Vite origin, not :3002.
      '/api': {
        target: process.env.DEV_API_PORT ? `http://localhost:${process.env.DEV_API_PORT}` : 'http://localhost:3002',
        changeOrigin: false,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, incoming: IncomingMessage) => {
            const h = incoming.headers.host;
            if (typeof h === 'string' && h.trim()) {
              proxyReq.setHeader('x-forwarded-host', h.trim());
              proxyReq.setHeader('x-forwarded-proto', 'http');
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    // Vercelyje dideli chunk map failai (~10 MB+) lėtina build ir gali baigtis OOM.
    sourcemap: !process.env.VERCEL,
    reportCompressedSize: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        previewAssignStudentModal: path.resolve(__dirname, 'preview-assign-student-modal.html'),
      },
    },
  },
});
