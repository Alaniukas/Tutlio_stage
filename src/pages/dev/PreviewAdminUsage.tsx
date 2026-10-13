import { useState } from 'react';
import AdminUsagePanel from '@/components/admin/AdminUsagePanel';
import { previewAdminUsageData } from './previewAdminUsageData';

export default function PreviewAdminUsage() {
  const [data] = useState(previewAdminUsageData);
  return <main className="min-h-screen bg-slate-950 p-4 md:p-8"><div className="mx-auto max-w-7xl"><p className="mb-5 text-xs text-slate-500">Lokalus preview · Pavyzdiniai duomenys</p><AdminUsagePanel adminSecret="" preview={data} /></div></main>;
}
