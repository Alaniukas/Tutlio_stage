import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const workspace = process.cwd();
const fixture = path.join(workspace, 'tests/browser/proklase-invoice-integrity');
export default defineConfig({ root: fixture, plugins: [react(), tailwindcss()],
  cacheDir: path.join(workspace, 'tmp/vite-invoice-integrity'),
  resolve: { alias: [
    ...['lib/supabase', 'lib/apiHelpers', 'lib/orgVisibleTutors', 'hooks/useOrgFeatures', 'contexts/OrgAdminAccessContext']
      .map(name => ({ find: `@/${name}`, replacement: path.join(fixture, 'fixtures.ts') })),
    ...['components/InvoiceSettingsForm', 'components/school/SchoolMonthlyInvoiceDialog']
      .map(name => ({ find: `@/${name}`, replacement: path.join(workspace, 'tests/browser/org-tutor-invoice-privacy/unused-view.tsx') })),
    { find: '@', replacement: path.join(workspace, 'src') },
  ] }, server: { host: '127.0.0.1', port: 3077, strictPort: true, fs: { allow: [workspace] } },
});
