import { Readable } from 'node:stream';
import type { VercelRequest, VercelResponse } from './types';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { resolveSchoolGroupMaterialAccess, SCHOOL_GROUP_MATERIAL_BUCKET, validMaterialObjectName } from './_lib/schoolGroupMaterialAccess.js';

const first = (value: string | string[] | undefined) => String(Array.isArray(value) ? value[0] || '' : value || '').trim();

/** Storage has no client read policy or reusable link. Every download checks live access twice. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' });
  const groupId = first(req.query?.group);
  const file = first(req.query?.file);
  const studentId = first(req.query?.student);
  const token = first(req.query?.t);
  if (!groupId || !validMaterialObjectName(file)) return res.status(400).json({ error: 'Invalid file' });
  const bearerSupplied = req.headers.authorization !== undefined;
  const auth = bearerSupplied ? await verifyRequestAuth(req) : null;
  if (bearerSupplied && (!auth?.userId || auth.isInternal)) return res.status(401).json({ error: 'Unauthorized' });
  const db = serviceSupabase();
  const authorized = async (): Promise<string | null> => {
    const result = await resolveSchoolGroupMaterialAccess(db, {
      userId: auth?.userId || null, groupId, studentId, token,
    });
    if (!result.ok || !result.groups.some((group) => group.id === groupId)) return null;
    const material = await db.from('school_group_material_files').select('file_name')
      .eq('group_id', groupId).eq('object_name', file)
      .not('published_at', 'is', null).maybeSingle();
    if (material.error) throw material.error;
    return material.data?.file_name || null;
  };
  try {
    if (!await authorized()) return res.status(403).json({ error: 'Forbidden' });
    const downloaded = await db.storage.from(SCHOOL_GROUP_MATERIAL_BUCKET).download(`${groupId}/${file}`);
    if (downloaded.error || !downloaded.data) return res.status(404).json({ error: 'File not found' });
    const body = Buffer.from(await downloaded.data.arrayBuffer());
    const originalName = await authorized();
    if (!originalName) return res.status(403).json({ error: 'Forbidden' });
    res.setHeader('Content-Type', downloaded.data.type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(body.length));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);
    if (req.method === 'HEAD') return res.status(200).end();
    res.statusCode = 200;
    Readable.from(body).pipe(res);
  } catch (error) {
    console.error('[school-group-material-file] failed', (error as Error).message);
    if (!res.headersSent) return res.status(503).json({ error: 'school_group_materials_unavailable' });
    res.destroy(error as Error);
  }
}
