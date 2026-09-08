import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';
const root = path.resolve('tests/browser/proklase');
export default defineConfig({ root, plugins: [{ name: 'qa-supabase', enforce: 'pre', resolveId(source) {
  if (source === './supabase' || source === './supabase.ts') return path.join(root, 'fixture.ts');
} }, react(), tailwind()],
  resolve: { alias: [
    ...['lib/supabase', 'contexts/UserContext', 'contexts/OrgAdminAccessContext', 'hooks/useOrgFeatures', 'hooks/useOrgTutorPolicy'].map((name) => ({ find: `@/${name}`, replacement: path.join(root, 'fixture.ts') })),
    { find: '@', replacement: path.resolve('src') },
  ] }, server: { host: '127.0.0.1', port: 3017, fs: { allow: [path.resolve('.')] } },
});
