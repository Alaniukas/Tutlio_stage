import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';
const root = path.resolve('tests/browser/school-support');
export default defineConfig({ root, plugins: [react(), tailwind()],
  resolve: { alias: [
    ...['lib/supabase', 'contexts/UserContext', 'contexts/OrgAdminAccessContext', 'hooks/useOrgFeatures'].map(name => ({find:`@/${name}`, replacement:path.join(root,'fixture.ts')})),
    {find:'@',replacement:path.resolve('src')},
  ] }, server:{host:'127.0.0.1',port:3018,strictPort:true,fs:{allow:[path.resolve('.')]}} });
