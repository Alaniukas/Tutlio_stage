import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Trash2, Video } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { useStudentPolicy } from '@/contexts/StudentPolicyContext';
import Layout from '@/components/Layout';
import StudentLayout from '@/components/StudentLayout';
import ParentLayout from '@/components/ParentLayout';

type Recording = {
  id: string;
  name: string;
  recordedAt: string | null;
  durationMillis: number | null;
  size: number | null;
  streamUrl: string;
};

type RecordingGroup = {
  id: string;
  name: string;
  configured: boolean;
  driveFolderId?: string;
  driveFolderName?: string | null;
  loadError?: string | null;
  recordings: Recording[];
};

type RecordingsResponse = {
  enabled: boolean;
  canManage: boolean;
  retentionDays: number;
  groups: RecordingGroup[];
  error?: string;
};

function fileSizeLabel(size: number | null): string | null {
  if (!size || size <= 0) return null;
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(0)} MB`;
  return `${Math.ceil(size / 1024)} KB`;
}

function durationLabel(durationMillis: number | null): string | null {
  if (!durationMillis || durationMillis <= 0) return null;
  const minutes = Math.floor(durationMillis / 60_000);
  const seconds = Math.floor((durationMillis % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const RECORDINGS_COMPACT_THRESHOLD = 3;

function recordingDetails(
  recording: Recording,
  locale: string,
): { title: string; meta: string | null } {
  const recorded = recording.recordedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(recording.recordedAt))
    : null;
  const meta = [recorded, durationLabel(recording.durationMillis), fileSizeLabel(recording.size)].filter(Boolean).join(' · ');
  return { title: recording.name, meta: meta || null };
}

function recordingPickerLabel(recording: Recording, locale: string): string {
  const { title, meta } = recordingDetails(recording, locale);
  return meta ? `${meta} — ${title}` : title;
}

function RecordingPlayer({
  recording,
  unsupportedLabel,
}: {
  recording: Recording;
  unsupportedLabel: string;
}) {
  return (
    <video
      key={recording.id}
      className="w-full aspect-video rounded-lg bg-black"
      controls
      controlsList="nodownload"
      preload="none"
      src={recording.streamUrl}
      onContextMenu={(event) => event.preventDefault()}
    >
      {unsupportedLabel}
    </video>
  );
}

function GroupRecordingsList({
  recordings,
  locale,
  countLabel,
  pickLabel,
  unsupportedLabel,
}: {
  recordings: Recording[];
  locale: string;
  countLabel: string;
  pickLabel: string;
  unsupportedLabel: string;
}) {
  const [selectedId, setSelectedId] = useState(recordings[0]?.id ?? '');

  useEffect(() => {
    if (!recordings.some((row) => row.id === selectedId)) {
      setSelectedId(recordings[0]?.id ?? '');
    }
  }, [recordings, selectedId]);

  if (!recordings.length) return null;

  const compact = recordings.length > RECORDINGS_COMPACT_THRESHOLD;
  const selected = recordings.find((row) => row.id === selectedId) ?? recordings[0];

  if (compact && selected) {
    return (
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm font-medium text-gray-700">{countLabel}</p>
          <div className="w-full sm:max-w-xl space-y-1.5">
            <Label className="text-xs text-gray-500">{pickLabel}</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={pickLabel} />
              </SelectTrigger>
              <SelectContent>
                {recordings.map((recording) => (
                  <SelectItem key={recording.id} value={recording.id}>
                    {recordingPickerLabel(recording, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 space-y-2 min-w-0">
          <div>
            <h3 className="font-medium text-gray-900 break-words">{recordingDetails(selected, locale).title}</h3>
            {recordingDetails(selected, locale).meta && (
              <p className="mt-1 text-xs text-gray-500">{recordingDetails(selected, locale).meta}</p>
            )}
          </div>
          <RecordingPlayer recording={selected} unsupportedLabel={unsupportedLabel} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
      {recordings.map((recording) => {
        const { title, meta } = recordingDetails(recording, locale);
        return (
          <article key={recording.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 space-y-3 min-w-0">
            <div>
              <h3 className="font-medium text-gray-900 break-words">{title}</h3>
              {meta && <p className="mt-1 text-xs text-gray-500">{meta}</p>}
            </div>
            <RecordingPlayer recording={recording} unsupportedLabel={unsupportedLabel} />
          </article>
        );
      })}
    </div>
  );
}

export default function SchoolLessonRecordings() {
  const { t, locale } = useTranslation();
  const location = useLocation();
  const { activeStudentId } = useStudentPolicy();
  const [searchParams] = useSearchParams();
  const selectedStudentId = searchParams.get('studentId') || activeStudentId;
  const [data, setData] = useState<RecordingsResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [folderInputs, setFolderInputs] = useState<Record<string, string>>({});
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [silentRefreshing, setSilentRefreshing] = useState(false);

  const endpoint = useMemo(() => {
    if (!selectedStudentId) return '/api/school-lesson-recordings';
    return `/api/school-lesson-recordings?studentId=${encodeURIComponent(selectedStudentId)}`;
  }, [selectedStudentId]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (silent) setSilentRefreshing(true);
    else setLoading(true);
    if (!silent) setError('');
    try {
      const headers = await authHeaders();
      const response = await fetch(endpoint, { headers });
      const payload = await response.json() as RecordingsResponse;
      if (!response.ok) throw new Error(payload.error || t('school.recordings.error'));
      setData(payload);
      setFolderInputs(Object.fromEntries(
        (payload.groups || []).map((group) => [group.id, group.driveFolderId || '']),
      ));
      setLastFetchedAt(new Date());
    } catch (loadError) {
      if (!silent) setError((loadError as Error)?.message || t('school.recordings.error'));
    } finally {
      if (silent) setSilentRefreshing(false);
      else setLoading(false);
    }
  }, [endpoint, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const poll = window.setInterval(() => void load({ silent: true }), 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const saveFolder = async (groupId: string, remove = false) => {
    setSavingGroupId(groupId);
    setError('');
    try {
      const headers = await authHeaders();
      const response = await fetch('/api/school-lesson-recordings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          groupId,
          driveFolderId: remove ? '' : folderInputs[groupId] || '',
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || t('school.recordings.error'));
      await load();
    } catch (saveError) {
      setError((saveError as Error)?.message || t('school.recordings.error'));
    } finally {
      setSavingGroupId(null);
    }
  };

  const withPortalLayout = (content: React.ReactNode) => {
    if (location.pathname.startsWith('/student/')) return <StudentLayout>{content}</StudentLayout>;
    if (location.pathname.startsWith('/parent/')) return <ParentLayout>{content}</ParentLayout>;
    if (location.pathname.startsWith('/school/')) return content;
    return <Layout>{content}</Layout>;
  };

  if (loading && !data) {
    return withPortalLayout(<div className="p-6 text-sm text-gray-500">{t('common.loading')}</div>);
  }

  return withPortalLayout(
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Video className="w-6 h-6 text-[var(--org-brand)]" />
            <h1 className="text-2xl font-bold text-gray-900">{t('school.recordings.title')}</h1>
          </div>
          <p className="mt-2 text-sm text-gray-600 max-w-3xl">
            {data?.canManage ? t('school.recordings.adminLead') : t('school.recordings.viewerLead')}
          </p>
          {data?.retentionDays ? (
            <p className="mt-1 text-xs text-gray-500">
              {t('school.recordings.retention', { days: data.retentionDays })}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-gray-500">{t('school.recordings.autoRefresh')}</p>
          {lastFetchedAt ? (
            <p className="mt-0.5 text-xs text-gray-400">
              {t('school.recordings.lastSynced', {
                time: lastFetchedAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
              })}
            </p>
          ) : null}
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading || silentRefreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading || silentRefreshing ? 'animate-spin' : ''}`} />
          {t('school.recordings.refresh')}
        </Button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && !data.enabled ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
          {t('school.recordings.disabled')}
        </div>
      ) : data && data.groups.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
          {t('school.recordings.noGroups')}
        </div>
      ) : (
        <div className="space-y-5">
          {(data?.groups || []).map((group) => (
            <section key={group.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">{group.name}</h2>
                {data?.canManage && (
                  <div className="mt-4 max-w-3xl">
                    <Label htmlFor={`drive-folder-${group.id}`}>{t('school.recordings.folder')}</Label>
                    <div className="mt-1.5 flex flex-col sm:flex-row gap-2">
                      <Input
                        id={`drive-folder-${group.id}`}
                        value={folderInputs[group.id] || ''}
                        onChange={(event) => setFolderInputs((previous) => ({
                          ...previous,
                          [group.id]: event.target.value,
                        }))}
                        placeholder="https://drive.google.com/drive/folders/..."
                        autoComplete="off"
                      />
                      <Button
                        onClick={() => void saveFolder(group.id)}
                        disabled={savingGroupId === group.id || !(folderInputs[group.id] || '').trim()}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {t('common.save')}
                      </Button>
                      {group.configured && (
                        <Button
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => void saveFolder(group.id, true)}
                          disabled={savingGroupId === group.id}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t('school.recordings.removeFolder')}
                        </Button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">{t('school.recordings.folderHelp')}</p>
                    {group.driveFolderName && (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        {t('school.recordings.connectedFolder')}: {group.driveFolderName}
                      </p>
                    )}
                  </div>
                )}
                {!data?.canManage && !group.configured && (
                  <p className="mt-2 text-sm text-gray-500">{t('school.recordings.notConfigured')}</p>
                )}
                {group.loadError && (
                  <p role="alert" className="mt-2 text-sm text-red-600">{group.loadError}</p>
                )}
              </div>

              {group.recordings.length > 0 ? (
                <GroupRecordingsList
                  recordings={group.recordings}
                  locale={locale}
                  countLabel={t('school.recordings.count', { count: String(group.recordings.length) })}
                  pickLabel={t('school.recordings.pickRecording')}
                  unsupportedLabel={t('school.recordings.videoUnsupported')}
                />
              ) : group.configured && !group.loadError ? (
                <p className="p-5 text-sm text-gray-500">
                  {t('school.recordings.empty', { days: data?.retentionDays || 30 })}
                </p>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
