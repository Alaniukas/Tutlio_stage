import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export type RecordingChatFile = { id: string; name: string; streamUrl: string };

function RecordingChatFilePanel({ file }: { file: RecordingChatFile }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setText(null);
    setError(false);
    const timeout = window.setTimeout(() => {
      setError(true);
      controller.abort();
    }, 30_000);
    void (async () => {
      try {
        const response = await fetch(file.streamUrl, {
          signal: controller.signal, credentials: 'same-origin', cache: 'no-store',
        });
        if (!response.ok) throw new Error('Chat unavailable');
        const content = await response.text();
        if (!controller.signal.aborted) setText(content);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, file.streamUrl]);

  return (
    <details className="rounded-lg border border-gray-200 bg-white" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer rounded-lg p-3 text-sm font-medium text-gray-800 focus-visible:outline-2 focus-visible:outline-indigo-500">
        <FileText className="mr-2 inline-block h-4 w-4" aria-hidden="true" />
        {t('school.recordings.chatTitle')}
        <span className="ml-2 break-all text-xs font-normal text-gray-500">{file.name}</span>
      </summary>
      {open && (
        <div className="border-t border-gray-100 p-3">
          {error ? (
            <p role="alert" className="text-sm text-red-600">{t('school.recordings.chatError')}</p>
          ) : text === null ? (
            <p role="status" className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t('school.recordings.chatLoading')}
            </p>
          ) : text.length === 0 ? (
            <p className="text-sm text-gray-500">{t('school.recordings.chatEmpty')}</p>
          ) : (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-800">{text}</pre>
          )}
        </div>
      )}
    </details>
  );
}

export default function RecordingChatFiles({ files }: { files?: RecordingChatFile[] }) {
  if (!files?.length) return null;
  return (
    <div className="space-y-2">
      {files.map((file) => <RecordingChatFilePanel key={file.id} file={file} />)}
    </div>
  );
}
