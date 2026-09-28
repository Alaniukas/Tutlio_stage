import type { VercelRequest, VercelResponse } from './types';
import { Readable } from 'node:stream';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { authorizeSchoolHomework } from './school-homework.js';
import { legacySessionMaterialPaths } from './_lib/schoolMaterialPublications.js';
import { schoolFamilyPortalEnabled } from './_lib/schoolFamilyGuardianAccess.js';
import { schoolSessionFileFolderAllowed } from './_lib/schoolSessionFileAccess.js';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || '';

/** No reusable Storage URL escapes the family portal. Every download checks current ownership. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' });
  const studentId = first(req.query.student); const sessionId = first(req.query.session);
  const folder = first(req.query.folder); const file = first(req.query.file); const token = first(req.query.t);
  if (!file || file.includes('/') || file.includes('\\') || file.startsWith('.') || !folder || !sessionId) return res.status(400).json({ error: 'Invalid file' });
  const bearerSupplied = req.headers.authorization !== undefined;
  const auth = bearerSupplied ? await verifyRequestAuth(req) : null;
  if (bearerSupplied && !auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
  const db = serviceSupabase();
  try {
    const check = async (): Promise<boolean> => {
      const access = await authorizeSchoolHomework(db, studentId, token, auth?.userId);
      if (!access.ok || !schoolFamilyPortalEnabled(access.org.features)) return false;
      if (!await schoolSessionFileFolderAllowed(db, { organizationId: access.org.id, studentId,
        sessionId, folderId: folder, fileName: file })) return false;
      if (!auth?.userId) {
        const legacy = await legacySessionMaterialPaths(db, access.org.id, [`${folder}/${file}`]);
        if (!legacy.has(`${folder}/${file}`)) return false;
      }
      return true;
    };
    if (!await check()) return res.status(403).json({ error: 'Forbidden' });
    const downloaded = await db.storage.from('session-files').download(`${folder}/${file}`);
    if (downloaded.error || !downloaded.data) return res.status(404).json({ error: 'File not found' });
    // Re-check after obtaining the object so an overwrite/revocation during the
    // upstream read cannot turn a legacy download into access to new material.
    const body = Buffer.from(await downloaded.data.arrayBuffer());
    if (!await check()) return res.status(403).json({ error: 'Forbidden' });
    res.setHeader('Content-Type', downloaded.data.type || 'application/octet-stream');
    res.setHeader('Content-Length', String(body.length));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file)}`);
    if (req.method === 'HEAD') return res.status(200).end();
    res.statusCode = 200;
    Readable.from(body).pipe(res);
  } catch (e) {
    console.error('[school-material-file] failed', (e as Error).message);
    if (!res.headersSent) return res.status(503).json({ error: 'school_material_access_unavailable' });
    res.destroy(e as Error);
  }
}
