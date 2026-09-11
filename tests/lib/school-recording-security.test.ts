import { describe, expect, it } from 'vitest';
import {
  extractGoogleDriveId,
  isRecordingWithinRetention,
  normalizeDriveByteRange,
} from '../../api/_lib/googleDriveRecordings';
import {
  createSchoolRecordingTicket,
  createSchoolRecordingViewerSession,
  verifySchoolRecordingTicket,
  verifySchoolRecordingViewerSession,
} from '../../api/_lib/schoolRecordingTicket';

describe('school recording playback security helpers', () => {
  it('accepts a Drive folder ID or Google folder URL but rejects other hosts', () => {
    const id = '1AbCdEfGhIjKlMnOpQrStUv';
    expect(extractGoogleDriveId(id)).toBe(id);
    expect(extractGoogleDriveId(`https://drive.google.com/drive/folders/${id}?usp=sharing`)).toBe(id);
    expect(extractGoogleDriveId(`https://evil.example/drive/folders/${id}`)).toBeNull();
    expect(extractGoogleDriveId('not a folder')).toBeNull();
  });

  it('limits every video response to a bounded byte range', () => {
    expect(normalizeDriveByteRange(undefined, 20_000_000, 1_000_000)).toEqual({ start: 0, end: 999_999 });
    expect(normalizeDriveByteRange('bytes=500-9999999', 20_000_000, 1_000_000)).toEqual({ start: 500, end: 1_000_499 });
    expect(normalizeDriveByteRange('bytes=-100', 1_000, 1_000_000)).toEqual({ start: 900, end: 999 });
    expect(normalizeDriveByteRange('bytes=1000-', 1_000)).toBeNull();
    expect(normalizeDriveByteRange('bytes=5-2', 1_000)).toBeNull();
  });

  it('denies recordings outside the configured retention window', () => {
    const nowMs = Date.parse('2026-09-11T12:00:00Z');
    expect(isRecordingWithinRetention('2026-08-13T12:00:00Z', { nowMs, retentionDays: 30 })).toBe(true);
    expect(isRecordingWithinRetention('2026-08-11T12:00:00Z', { nowMs, retentionDays: 30 })).toBe(false);
    expect(isRecordingWithinRetention(null, { nowMs, retentionDays: 30 })).toBe(false);
  });

  it('signs all access coordinates and rejects tampering or expiry', () => {
    const signingSecret = 'test-secret-that-is-not-used-outside-tests';
    const nowMs = Date.parse('2026-09-11T12:00:00Z');
    const token = createSchoolRecordingTicket(
      { userId: 'user-1', groupId: 'group-1', fileId: 'file-1' },
      { signingSecret, nowMs, ttlSeconds: 60 },
    );
    expect(verifySchoolRecordingTicket(token, { signingSecret, nowMs })).toMatchObject({
      userId: 'user-1',
      groupId: 'group-1',
      fileId: 'file-1',
    });
    expect(verifySchoolRecordingTicket(`${token}x`, { signingSecret, nowMs })).toBeNull();
    expect(verifySchoolRecordingTicket(token, { signingSecret, nowMs: nowMs + 61_000 })).toBeNull();
  });

  it('uses a separate signed HttpOnly-session value so a playback URL cannot act as a browser session', () => {
    const signingSecret = 'test-secret-that-is-not-used-outside-tests';
    const nowMs = Date.parse('2026-09-11T12:00:00Z');
    const playback = createSchoolRecordingTicket(
      { userId: 'user-1', groupId: 'group-1', fileId: 'file-1' },
      { signingSecret, nowMs },
    );
    const viewer = createSchoolRecordingViewerSession('user-1', { signingSecret, nowMs });

    expect(verifySchoolRecordingViewerSession(playback, { signingSecret, nowMs })).toBeNull();
    expect(verifySchoolRecordingViewerSession(viewer, { signingSecret, nowMs })).toMatchObject({ userId: 'user-1' });
    expect(verifySchoolRecordingTicket(viewer, { signingSecret, nowMs })).toBeNull();
  });
});
