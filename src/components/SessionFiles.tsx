import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Paperclip, Upload, Trash2, Download, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface StorageFile {
  name: string;
  metadata: { size: number } | null;
}

interface SessionFilesProps {
  sessionId: string;
  role: 'tutor' | 'student';
}

export default function SessionFiles({ sessionId, role }: SessionFilesProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchFiles() {
    setLoading(true);
    const { data } = await supabase.storage
      .from('session-files')
      .list(sessionId, { sortBy: { column: 'created_at', order: 'asc' } });
    const mapped: StorageFile[] = (data ?? []).map((f) => ({
      name: f.name,
      metadata: f.metadata?.size != null ? { size: Number(f.metadata.size) } : null,
    }));
    setFiles(mapped);
    setLoading(false);
  }

  useEffect(() => { fetchFiles(); }, [sessionId]);

  function safeObjectName(originalName: string): string {
    // Supabase Storage rejects some characters in object keys (e.g. diacritics, some punctuation).
    // Keep the extension, normalize to ASCII, and allow only a safe subset.
    const trimmed = (originalName || '').trim();
    const dot = trimmed.lastIndexOf('.');
    const base = (dot > 0 ? trimmed.slice(0, dot) : trimmed) || 'file';
    const ext = dot > 0 ? trimmed.slice(dot).toLowerCase() : '';

    const ascii = base
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[^a-zA-Z0-9._-]+/g, '_') // replace unsafe with underscore
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    const safeBase = ascii.length > 0 ? ascii.slice(0, 120) : 'file';
    return `${safeBase}${ext}`.slice(0, 140);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const safeName = safeObjectName(file.name);
    const { error } = await supabase.storage
      .from('session-files')
      .upload(`${sessionId}/${safeName}`, file, { upsert: true });
    if (error) setError(error.message);
    else await fetchFiles();
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDownload(fileName: string) {
    const { data, error } = await supabase.storage
      .from('session-files')
      .createSignedUrl(`${sessionId}/${fileName}`, 60);
    if (error || !data) { setError(t('files.downloadFailed')); return; }
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = fileName;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }

  async function handleDelete(fileName: string) {
    const { error } = await supabase.storage
      .from('session-files')
      .remove([`${sessionId}/${fileName}`]);
    if (error) setError(error.message);
    else await fetchFiles();
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Paperclip className="w-4 h-4" /> {t('common.files')}
        </p>
        {role === 'tutor' && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xlsx,.txt"
              onChange={handleUpload}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-xl h-7 px-2.5 text-xs"
            >
              {uploading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Upload className="w-3.5 h-3.5 mr-1" />}
              {uploading ? t('common.uploading') : t('common.upload')}
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('common.loading')}
        </div>
      ) : files.length === 0 ? (
        <p className="text-xs text-gray-400 py-1">
          {role === 'tutor' ? t('files.noFiles') : t('files.noFilesTutor')}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-xs">
              <Paperclip className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="flex-1 truncate text-gray-800">{f.name}</span>
              {f.metadata?.size != null && (
                <span className="text-gray-400 flex-shrink-0">{formatBytes(f.metadata.size)}</span>
              )}
              <button
                onClick={() => handleDownload(f.name)}
                className="text-indigo-500 hover:text-indigo-700 flex-shrink-0"
                title={t('common.download')}
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              {role === 'tutor' && (
                <button
                  onClick={() => handleDelete(f.name)}
                  className="text-red-400 hover:text-red-600 flex-shrink-0"
                  title={t('common.delete')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}
