import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('jsonwebtoken', () => ({ default: { sign: () => 'test-assertion' } }));

import {
  clearDriveRecordingListCache,
  DRIVE_CHAT_MAX_BYTES,
  isChatFileForRecording,
  isDriveRecordingChatFile,
  listDriveRecordings,
  type DriveRecordingFile,
} from '../../api/_lib/googleDriveRecordings';

const folder = 'test-folder-12345';
const video = (overrides: Partial<DriveRecordingFile> = {}): DriveRecordingFile => ({
  id: 'video-12345', name: 'Matematika 2026-10-07.mp4', mimeType: 'video/mp4',
  createdTime: '2026-10-07T10:00:00Z', modifiedTime: '2026-10-07T10:00:00Z',
  size: 100_000, parents: [folder], canDownload: true, durationMillis: 60_000,
  ...overrides,
});
const chat = (overrides: Partial<DriveRecordingFile> = {}): DriveRecordingFile => video({
  id: 'chat-12345', name: 'Matematika 2026-10-07.sbv', mimeType: 'application/octet-stream',
  size: 100, durationMillis: null, ...overrides,
});

describe('Google Drive recording companion chats', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
    vi.stubEnv('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64', '');
    vi.stubEnv('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON', JSON.stringify({ client_email: 'test@example.invalid', private_key: 'test-key' }));
    vi.stubEnv('SCHOOL_RECORDING_RETENTION_DAYS', '30');
    clearDriveRecordingListCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  function drivePages(pages: Array<{ files: DriveRecordingFile[]; nextPageToken?: string }>) {
    const requestedPages: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'test-only', expires_in: 3600 });
      expect(url.searchParams.get('q')).toContain(`'${folder}' in parents`);
      requestedPages.push(url.searchParams.get('pageToken') || '');
      const page = pages[Math.min(requestedPages.length - 1, pages.length - 1)];
      return Response.json({ ...page, files: page.files.map((file) => ({
        ...file, capabilities: { canDownload: file.canDownload },
      })) });
    }));
    return requestedPages;
  }

  it('pairs SBV and text copies across Drive pages without listing unrelated or unsafe files', async () => {
    drivePages([
      { files: [video(), chat({ id: 'unrelated', name: 'Other lesson.txt', mimeType: 'text/plain' })], nextPageToken: 'page-2' },
      { files: [
        chat(), chat({ id: 'text-copy', name: 'Matematika 2026-10-07 (chat).txt', mimeType: 'text/plain' }),
        chat({ id: 'wrong-folder', parents: ['other-folder'] }),
        chat({ id: 'blocked', canDownload: false }),
        chat({ id: 'expired', createdTime: '2026-09-01T12:00:00Z' }),
        chat({ id: 'html', mimeType: 'text/html' }),
        chat({ id: 'too-large', size: DRIVE_CHAT_MAX_BYTES + 1 }),
      ] },
    ]);
    const result = await listDriveRecordings(folder);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('video-12345');
    expect(result[0].chatFiles?.map((file) => file.id)).toEqual(['chat-12345', 'text-copy']);
  });

  it('withholds ambiguous companion chats instead of assigning them by date or order', async () => {
    drivePages([{ files: [video(), video({ id: 'second-video', name: 'Matematika 2026-10-07.webm' }), chat()] }]);
    const result = await listDriveRecordings(folder);
    expect(result).toHaveLength(2);
    expect(result.every((file) => !file.chatFiles?.length)).toBe(true);
  });

  it.each([
    ['abc-defg-hij (2026-09-09 06:57 GMT+1)', '– Chat transcript'],
    ['QA IT - Seniors - 2026/09/14 11:57 BST', '– Chat'],
    ['QA IT - Seniors - 2026/09/07 11:50 BST', '– Chat'],
  ])('pairs the extensionless Meet chat for %s', async (stem, suffix) => {
    drivePages([{ files: [video({ name: `${stem}.mp4` }), chat({ name: `${stem} ${suffix}`, mimeType: 'text/plain' })] }]);
    const recordings = await listDriveRecordings(folder);
    expect(recordings[0].chatFiles?.map((file) => file.id)).toEqual(['chat-12345']);
  });

  it('preserves dotted meeting titles and extensionless video names when matching', () => {
    const name = 'Ms. Jones 2026-10-07';
    expect(isChatFileForRecording(chat({ name: `${name} – Chat`, mimeType: 'text/plain' }), video({ name }))).toBe(true);
    expect(isChatFileForRecording(chat({ name: `${name}.mp4 – Chat transcript.txt`, mimeType: 'text/plain' }), video({ name: `${name}.mp4` }))).toBe(true);
    expect(isChatFileForRecording(chat({ name: 'Ms. Other 2026-10-07 – Chat', mimeType: 'text/plain' }), video({ name }))).toBe(false);
  });

  it('requires an explicit chat suffix and plain MIME type for files without an extension', () => {
    expect(isDriveRecordingChatFile(chat({ name: 'Lesson – Chat', mimeType: 'text/plain' }))).toBe(true);
    expect(isDriveRecordingChatFile(chat({ name: 'Lesson – Chat transcript', mimeType: 'application/octet-stream' }))).toBe(false);
    expect(isDriveRecordingChatFile(chat({ name: 'Lesson – Chat', mimeType: 'text/html' }))).toBe(false);
    expect(isDriveRecordingChatFile(chat({ name: 'Lesson notes', mimeType: 'text/plain' }))).toBe(false);
    expect(isDriveRecordingChatFile(chat({ name: 'Lesson – Chat transcript', mimeType: 'text/plain', size: DRIVE_CHAT_MAX_BYTES + 1 }))).toBe(false);
  });

  it('refreshes cached metadata so a chat created after the video eventually appears', async () => {
    const requests = drivePages([{ files: [video()] }, { files: [video(), chat()] }]);
    expect((await listDriveRecordings(folder))[0].chatFiles).toBeUndefined();
    await listDriveRecordings(folder);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(90_001);
    expect((await listDriveRecordings(folder))[0].chatFiles).toHaveLength(1);
    expect(requests).toHaveLength(2);
  });

  it('requires plain bounded text, matching names and a shared folder', () => {
    expect(isDriveRecordingChatFile(chat())).toBe(true);
    expect(isDriveRecordingChatFile(chat({ size: null }))).toBe(false);
    expect(isDriveRecordingChatFile(chat({ name: 'Matematika.html', mimeType: 'text/html' }))).toBe(false);
    expect(isChatFileForRecording(chat({ name: 'Matematika 2026-10-07.mp4.sbv' }), video())).toBe(true);
    expect(isChatFileForRecording(chat({ name: 'Matematika 2026-10-08.sbv' }), video())).toBe(false);
    expect(isChatFileForRecording(chat({ parents: ['other-folder'] }), video())).toBe(false);
  });
});
