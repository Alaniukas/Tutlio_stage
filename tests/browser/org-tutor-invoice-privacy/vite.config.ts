import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const workspace = process.cwd();
const fixture = path.join(workspace, 'tests/browser/org-tutor-invoice-privacy');
// This separate entry renders production components with synthetic backend/auth
// data. It is never included in the application's build or public routes.
export default defineConfig({
  root: fixture,
  plugins: [react(), tailwindcss()],
  resolve: { alias: [
    ...['lib/supabase', 'lib/apiHelpers', 'lib/preload', 'contexts/UserContext',
      'hooks/useOrgFeatures', 'hooks/useOrgTutorPolicy'].map(name => ({
      find: `@/${name}`, replacement: path.join(fixture, 'fixtures.ts'),
    })),
    ...['components/InvoiceSettingsForm', 'components/Layout'].map(name => ({
      find: `@/${name}`, replacement: path.join(fixture, 'unused-view.tsx'),
    })),
    { find: '@', replacement: path.join(workspace, 'src') },
  ] },
  server: { host: '127.0.0.1', port: 3076, strictPort: true, fs: { allow: [workspace] } },
});
