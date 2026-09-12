import jwt from 'jsonwebtoken';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export const DEFAULT_RECORDING_RETENTION_DAYS = 30;
export const DRIVE_STREAM_CHUNK_BYTES = 8 * 1024 * 1024;

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface DriveRecordingFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string | null;
  modifiedTime: string | null;
  size: number | null;
  parents: string[];
  canDownload: boolean;
  durationMillis: number | null;
}

type GoogleDriveFilePayload = {
  id?: string;
  name?: string;
  mimeType?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
  capabilities?: { canDownload?: boolean };
  videoMediaMetadata?: { durationMillis?: string };
};

let cachedAccessToken: { value: string; expiresAtMs: number } | null = null;

function parseCredentials(): ServiceAccountCredentials {
  const base64 = String(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64 || '').trim();
  const rawJson = base64
    ? Buffer.from(base64, 'base64').toString('utf8')
    : String(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!rawJson) throw new Error('Google Drive service account is not configured');

  let parsed: Partial<ServiceAccountCredentials>;
  try {
    parsed = JSON.parse(rawJson) as Partial<ServiceAccountCredentials>;
  } catch {
    throw new Error('Google Drive service account JSON is invalid');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Google Drive service account JSON is missing required fields');
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
    token_uri: parsed.token_uri,
  };
}

async function accessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }
  const credentials = parseCredentials();
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = credentials.token_uri || GOOGLE_TOKEN_URL;
  const assertion = jwt.sign(
    {
      iss: credentials.client_email,
      scope: DRIVE_READONLY_SCOPE,
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    },
    credentials.private_key,
    { algorithm: 'RS256' },
  );
  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || 'Google Drive authentication failed');
  }
  cachedAccessToken = {
    value: payload.access_token,
    expiresAtMs: Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000,
  };
  return cachedAccessToken.value;
}

function mapDriveFile(file: GoogleDriveFilePayload): DriveRecordingFile {
  const numericSize = Number(file.size);
  const numericDuration = Number(file.videoMediaMetadata?.durationMillis);
  return {
    id: String(file.id || ''),
    name: String(file.name || 'Įrašas'),
    mimeType: String(file.mimeType || 'application/octet-stream'),
    createdTime: file.createdTime || null,
    modifiedTime: file.modifiedTime || null,
    size: Number.isSafeInteger(numericSize) && numericSize >= 0 ? numericSize : null,
    parents: Array.isArray(file.parents) ? file.parents.map(String) : [],
    canDownload: file.capabilities?.canDownload !== false,
    durationMillis: Number.isFinite(numericDuration) && numericDuration >= 0 ? numericDuration : null,
  };
}

async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`Google Drive request failed (${response.status}): ${details}`);
  }
  return response;
}

export function extractGoogleDriveId(value: string): string | null {
  const trimmed = String(value || '').trim();
  if (/^[A-Za-z0-9_-]{10,200}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (!/(^|\.)google\.com$/.test(url.hostname) && !/(^|\.)googleusercontent\.com$/.test(url.hostname)) return null;
    const folderMatch = url.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,200})/);
    if (folderMatch?.[1]) return folderMatch[1];
    const fileMatch = url.pathname.match(/\/d\/([A-Za-z0-9_-]{10,200})/);
    if (fileMatch?.[1]) return fileMatch[1];
    const queryId = url.searchParams.get('id');
    return queryId && /^[A-Za-z0-9_-]{10,200}$/.test(queryId) ? queryId : null;
  } catch {
    return null;
  }
}

export function recordingRetentionDays(): number {
  const configured = Number(process.env.SCHOOL_RECORDING_RETENTION_DAYS || DEFAULT_RECORDING_RETENTION_DAYS);
  return Number.isFinite(configured) && configured >= 1 && configured <= 365
    ? Math.floor(configured)
    : DEFAULT_RECORDING_RETENTION_DAYS;
}

export function isRecordingWithinRetention(
  createdTime: string | null,
  options: { nowMs?: number; retentionDays?: number } = {},
): boolean {
  if (!createdTime) return false;
  const createdMs = Date.parse(createdTime);
  if (!Number.isFinite(createdMs)) return false;
  const days = options.retentionDays ?? recordingRetentionDays();
  return createdMs >= (options.nowMs ?? Date.now()) - days * 86_400_000;
}

export type DriveByteRange = { start: number; end: number };

export function normalizeDriveByteRange(
  header: string | undefined,
  size: number,
  maxChunkBytes = DRIVE_STREAM_CHUNK_BYTES,
): DriveByteRange | null {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  if (!header) return { start: 0, end: Math.min(size - 1, maxChunkBytes - 1) };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;

  let start: number;
  let requestedEnd: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - Math.min(size, suffixLength));
    requestedEnd = size - 1;
  } else {
    start = Number(match[1]);
    requestedEnd = match[2] ? Number(match[2]) : size - 1;
  }
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(requestedEnd)
    || start < 0
    || requestedEnd < start
    || start >= size
  ) return null;
  return {
    start,
    end: Math.min(size - 1, requestedEnd, start + maxChunkBytes - 1),
  };
}

const FILE_FIELDS = 'id,name,mimeType,createdTime,modifiedTime,size,parents,capabilities(canDownload),videoMediaMetadata(durationMillis)';

export async function getDriveFileMetadata(fileId: string): Promise<DriveRecordingFile> {
  const safeId = extractGoogleDriveId(fileId);
  if (!safeId) throw new Error('Invalid Google Drive file ID');
  const params = new URLSearchParams({ fields: FILE_FIELDS, supportsAllDrives: 'true' });
  const response = await driveFetch(`/files/${encodeURIComponent(safeId)}?${params}`);
  return mapDriveFile(await response.json() as GoogleDriveFilePayload);
}

export async function listDriveRecordings(folderId: string): Promise<DriveRecordingFile[]> {
  const safeId = extractGoogleDriveId(folderId);
  if (!safeId) throw new Error('Invalid Google Drive folder ID');
  const files: DriveRecordingFile[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${safeId.replace(/'/g, "\\'")}' in parents and trashed = false`,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      orderBy: 'createdTime desc',
      pageSize: '100',
      spaces: 'drive',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await driveFetch(`/files?${params}`);
    const payload = await response.json() as { nextPageToken?: string; files?: GoogleDriveFilePayload[] };
    files.push(...(payload.files || []).map(mapDriveFile));
    pageToken = payload.nextPageToken || '';
  } while (pageToken && files.length < 300);

  return files.filter((file) =>
    file.mimeType.startsWith('video/')
    && file.canDownload
    && file.parents.includes(safeId)
    && isRecordingWithinRetention(file.createdTime),
  );
}

export async function fetchDriveRecordingRange(
  fileId: string,
  range: DriveByteRange,
): Promise<Response> {
  const safeId = extractGoogleDriveId(fileId);
  if (!safeId) throw new Error('Invalid Google Drive file ID');
  return driveFetch(`/files/${encodeURIComponent(safeId)}?alt=media&supportsAllDrives=true`, {
    headers: { Range: `bytes=${range.start}-${range.end}` },
  });
}
