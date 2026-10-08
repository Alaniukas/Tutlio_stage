import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const workspace = process.cwd();
const fixture = path.join(workspace, 'tests/browser/tutor-company-environments');
export default defineConfig({
  root: fixture, publicDir: path.join(workspace, 'public'), envDir: false, plugins: [react(), tailwindcss()],
  resolve: { alias: [
    { find: '@/lib/supabase', replacement: path.join(fixture, 'backend.ts') },
    { find: '@/hooks/usePushSubscription', replacement: path.join(fixture, 'no-push.ts') },
    { find: '@', replacement: path.join(workspace, 'src') },
  ] },
  server: { host: '127.0.0.1', port: 3078, strictPort: true, fs: { allow: [workspace] } },
});
