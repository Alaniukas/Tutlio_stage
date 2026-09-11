import { Readable } from 'node:stream';
import type { VercelRequest, VercelResponse } from './types';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import {
  fetchDriveRecordingRange,
  getDriveFileMetadata,
  isRecordingWithinRetention,
  normalizeDriveByteRange,
} from './_lib/googleDriveRecordings.js';
import { resolveRecordingViewerAccess } from './_lib/schoolRecordingAccess.js';
import {
  verifySchoolRecordingTicket,
  verifySchoolRecordingViewerSession,
} from './_lib/schoolRecordingTicket.js';

function firstQueryValue(value: string | string[] | undefined): string {
  return String(Array.isArray(value) ? value[0] || '' : value || '').trim();
}

function recordingViewerCookie(header: string | undefined): string {
  for (const part of String(header || '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name !== 'tutlio_recording_viewer') continue;
    try {
      return decodeURIComponent(value.join('='));
    } catch {
      return '';
    }
  }
  return '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const ticket = verifySchoolRecordingTicket(firstQueryValue(req.query?.t));
  if (!ticket) return res.status(401).json({ error: 'Įrašo nuoroda nebegalioja.' });
  const viewerSession = verifySchoolRecordingViewerSession(
    recordingViewerCookie(typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined),
  );
  if (!viewerSession || viewerSession.userId !== ticket.userId) {
    return res.status(401).json({ error: 'Atidarykite įrašą prisijungę prie Tutlio.' });
  }

  const supabase = serviceSupabase();
  try {
    // Re-check current relationships on every media request. Removing a
    // member, teacher, folder mapping, or feature flag revokes the next range.
    const access = await resolveRecordingViewerAccess(supabase, ticket.userId);
    const group = access.groups.find((candidate) => candidate.id === ticket.groupId);
    if (!group) return res.status(403).json({ error: 'Prieiga prie šio įrašo neleidžiama.' });

    const { data: mapping, error: mappingError } = await supabase
      .from('school_recording_drive_folders')
      .select('drive_folder_id')
      .eq('group_id', group.id)
      .eq('organization_id', group.organizationId)
      .maybeSingle();
    if (mappingError || !mapping?.drive_folder_id) {
      return res.status(404).json({ error: 'Įrašo aplankas nerastas.' });
    }

    const file = await getDriveFileMetadata(ticket.fileId);
    if (
      !file.mimeType.startsWith('video/')
      || !file.canDownload
      || !file.parents.includes(mapping.drive_folder_id)
      || !isRecordingWithinRetention(file.createdTime)
    ) {
      return res.status(404).json({ error: 'Įrašas nerastas arba jo saugojimo terminas pasibaigė.' });
    }
    if (!file.size) return res.status(422).json({ error: 'Google Drive nepateikė įrašo dydžio.' });

    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;
    const range = normalizeDriveByteRange(rangeHeader, file.size);
    if (!range) {
      res.setHeader('Content-Range', `bytes */${file.size}`);
      return res.status(416).send('Requested range not satisfiable');
    }
    const length = range.end - range.start + 1;
    res.statusCode = 206;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`);
    res.setHeader('Content-Length', String(length));
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    if (req.method === 'HEAD') return res.end();

    const upstream = await fetchDriveRecordingRange(file.id, range);
    if (!upstream.body) return res.status(502).end();
    const upstreamLength = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(upstreamLength) && upstreamLength !== length) {
      console.error('[school-recording-stream] Unexpected Drive range length', upstreamLength, length);
      return res.status(502).end();
    }
    Readable.fromWeb(upstream.body as never).pipe(res);
  } catch (error) {
    console.error('[school-recording-stream] failed', (error as Error)?.message);
    if (!res.headersSent) return res.status(502).json({ error: 'Įrašo transliacija laikinai nepasiekiama.' });
    res.destroy(error as Error);
  }
}
