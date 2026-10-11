import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { RecordingChatStatus } from '@/lib/schoolLessonRecordings';

export type RecordingChatFile = { id: string; name: string; streamUrl: string };

const unavailableKeys = {
  missing: 'school.recordings.chatMissing',
  restricted: 'school.recordings.chatRestricted',
  expired: 'school.recordings.chatExpired',
  ambiguous: 'school.recordings.chatAmbiguous',
} as const;

function ChatUnavailableText({ status, canManage }: {
  status: Exclude<RecordingChatStatus, 'available'>;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <p className="text-sm text-gray-600">{t(unavailableKeys[status])}</p>
      {canManage && (status === 'missing' || status === 'restricted') && (
        <p className="mt-2 text-xs text-gray-500">
          {t(status === 'restricted' ? 'school.recordings.chatRestrictedAdmin' : 'school.recordings.chatMissingAdmin')}
        </p>
      )}
    </>
  );
}

function RecordingChatFilePanel({ file, canManage }: { file: RecordingChatFile; canManage: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<'failed' | 'restricted' | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setText(null);
    setError(null);
    const timeout = window.setTimeout(() => {
      setError('failed');
      controller.abort();
    }, 30_000);
    void (async () => {
      try {
        const response = await fetch(file.streamUrl, {
          signal: controller.signal, credentials: 'same-origin', cache: 'no-store',
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => null) as { code?: string } | null;
          if (!controller.signal.aborted) {
            setError(response.status === 403 && failure?.code === 'CHAT_ACCESS_RESTRICTED' ? 'restricted' : 'failed');
          }
          return;
        }
        const content = await response.text();
        if (!controller.signal.aborted) setText(content);
      } catch {
        if (!controller.signal.aborted) setError('failed');
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
          {error === 'restricted' ? (
            <div role="alert"><ChatUnavailableText status="restricted" canManage={canManage} /></div>
          ) : error ? (
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

export default function RecordingChatFiles({ files, status, canManage = false }: {
  files?: RecordingChatFile[];
  status?: RecordingChatStatus;
  canManage?: boolean;
}) {
  const { t } = useTranslation();
  if (!files?.length) {
    return (
      <div role="status" className="rounded-lg border border-gray-200 bg-white p-3">
        <p className="mb-1 text-sm font-medium text-gray-800">
          <FileText className="mr-2 inline-block h-4 w-4" aria-hidden="true" />
          {t('school.recordings.chatTitle')}
        </p>
        <ChatUnavailableText status={status && status !== 'available' ? status : 'missing'} canManage={canManage} />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {files.map((file) => <RecordingChatFilePanel key={file.id} file={file} canManage={canManage} />)}
    </div>
  );
}
