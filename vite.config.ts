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
        description: 'Korepetitoriams ir mokiniams valdyti laiką',
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        importScripts: ['/push-sw.js'],
        runtimeCaching: [
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
  },
});
