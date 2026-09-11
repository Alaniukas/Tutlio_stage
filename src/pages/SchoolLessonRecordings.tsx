import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Trash2, Video } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  const endpoint = useMemo(() => {
    if (!selectedStudentId) return '/api/school-lesson-recordings';
    return `/api/school-lesson-recordings?studentId=${encodeURIComponent(selectedStudentId)}`;
  }, [selectedStudentId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      const response = await fetch(endpoint, { headers });
      const payload = await response.json() as RecordingsResponse;
      if (!response.ok) throw new Error(payload.error || t('school.recordings.error'));
      setData(payload);
      setFolderInputs(Object.fromEntries(
        (payload.groups || []).map((group) => [group.id, group.driveFolderId || '']),
      ));
    } catch (loadError) {
      setError((loadError as Error)?.message || t('school.recordings.error'));
    } finally {
      setLoading(false);
    }
  }, [endpoint, t]);

  useEffect(() => {
    void load();
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
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
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
                <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
                  {group.recordings.map((recording) => {
                    const recorded = recording.recordedAt
                      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(recording.recordedAt))
                      : null;
                    const details = [recorded, durationLabel(recording.durationMillis), fileSizeLabel(recording.size)].filter(Boolean);
                    return (
                      <article key={recording.id} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 space-y-3 min-w-0">
                        <div>
                          <h3 className="font-medium text-gray-900 break-words">{recording.name}</h3>
                          {details.length > 0 && <p className="mt-1 text-xs text-gray-500">{details.join(' · ')}</p>}
                        </div>
                        <video
                          className="w-full aspect-video rounded-lg bg-black"
                          controls
                          controlsList="nodownload"
                          preload="none"
                          src={recording.streamUrl}
                          onContextMenu={(event) => event.preventDefault()}
                        >
                          {t('school.recordings.videoUnsupported')}
                        </video>
                      </article>
                    );
                  })}
                </div>
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
