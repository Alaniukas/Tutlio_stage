import type { VercelRequest, VercelResponse } from './types';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import {
  materialObjectName, resolveSchoolGroupMaterialAccess,
  SCHOOL_GROUP_MATERIAL_BUCKET, validMaterialFile, validMaterialObjectName,
} from './_lib/schoolGroupMaterialAccess.js';

const first = (value: string | string[] | undefined) => String(Array.isArray(value) ? value[0] || '' : value || '').trim();
const bodyOf = (req: VercelRequest): Record<string, unknown> => {
  if (typeof req.body !== 'string') return (req.body || {}) as Record<string, unknown>;
  try { return JSON.parse(req.body) as Record<string, unknown>; } catch { return {}; }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const bearerSupplied = req.headers.authorization !== undefined;
  const auth = bearerSupplied ? await verifyRequestAuth(req) : null;
  if (bearerSupplied && (!auth?.userId || auth.isInternal)) return res.status(401).json({ error: 'Unauthorized' });
  const body = req.method === 'POST' ? bodyOf(req) : {};
  const groupId = req.method === 'GET' ? first(req.query?.group) : String(body.group || '').trim();
  const studentId = req.method === 'GET' ? first(req.query?.student) : '';
  const token = req.method === 'GET' ? first(req.query?.t) : '';
  const db = serviceSupabase();

  try {
    const access = await resolveSchoolGroupMaterialAccess(db, {
      userId: auth?.userId || null, groupId, studentId, token,
    });
    if (access.ok === false) return res.status(access.status).json({ error: 'Forbidden' });

    if (req.method === 'GET') {
      const groups = await Promise.all(access.groups.map(async (group) => {
        const files: Array<{ id: string; name: string; size: number; createdAt: string }> = [];
        for (let offset = 0; ; offset += 200) {
          const result = await db.from('school_group_material_files')
            .select('object_name, file_name, size_bytes, created_at')
            .eq('group_id', group.id).not('published_at', 'is', null)
            .order('created_at', { ascending: false }).range(offset, offset + 199);
          if (result.error) throw result.error;
          files.push(...(result.data || []).map((row) => ({
            id: row.object_name, name: row.file_name, size: row.size_bytes, createdAt: row.created_at,
          })));
          if ((result.data || []).length < 200) break;
        }
        return { id: group.id, name: group.name, files };
      }));
      // A member or teacher can be removed while Storage is being read.
      const current = await resolveSchoolGroupMaterialAccess(db, {
        userId: auth?.userId || null, groupId, studentId, token,
      });
      if (!current.ok || groups.some((group) => !current.groups.some((row) => row.id === group.id))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return res.status(200).json({ ok: true, groups, canManage: current.canManage });
    }

    if (!access.canManage || !auth?.userId || !groupId || access.groups[0]?.id !== groupId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (body.action === 'upload-url') {
      const fileName = String(body.fileName || '').trim();
      const size = Number(body.size);
      if (!validMaterialFile(fileName, size)) return res.status(400).json({ error: 'Invalid file' });
      const objectName = materialObjectName(fileName);
      const path = `${groupId}/${objectName}`;
      const inserted = await db.from('school_group_material_files').insert({
        group_id: groupId, object_name: objectName, file_name: fileName,
        size_bytes: size, uploaded_by: auth.userId,
      });
      if (inserted.error) throw inserted.error;
      const signed = await db.storage.from(SCHOOL_GROUP_MATERIAL_BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (signed.error || !signed.data?.token) {
        await db.from('school_group_material_files').delete().eq('group_id', groupId).eq('object_name', objectName);
        throw signed.error || new Error('Signed upload unavailable');
      }
      return res.status(200).json({ ok: true, path, token: signed.data.token });
    }
    if (body.action === 'publish') {
      const objectName = String(body.file || '').trim();
      if (!validMaterialObjectName(objectName)) return res.status(400).json({ error: 'Invalid file' });
      const pending = await db.from('school_group_material_files')
        .select('id').eq('group_id', groupId).eq('object_name', objectName)
        .eq('uploaded_by', auth.userId).is('published_at', null).maybeSingle();
      if (pending.error) throw pending.error;
      if (!pending.data) return res.status(404).json({ error: 'File not found' });
      const exists = await db.storage.from(SCHOOL_GROUP_MATERIAL_BUCKET).exists(`${groupId}/${objectName}`);
      if (exists.error) throw exists.error;
      if (!exists.data) return res.status(400).json({ error: 'Upload is not complete' });
      // Reassignment during the Storage check must not publish a stale upload.
      const current = await resolveSchoolGroupMaterialAccess(db, { userId: auth.userId, groupId });
      if (!current.ok || !current.canManage) return res.status(403).json({ error: 'Forbidden' });
      const published = await db.from('school_group_material_files')
        .update({ published_at: new Date().toISOString() })
        .eq('id', pending.data.id).eq('uploaded_by', auth.userId).is('published_at', null);
      if (published.error) throw published.error;
      return res.status(200).json({ ok: true });
    }
    if (body.action === 'remove') {
      const objectName = String(body.file || '').trim();
      if (!validMaterialObjectName(objectName)) return res.status(400).json({ error: 'Invalid file' });
      const current = await resolveSchoolGroupMaterialAccess(db, { userId: auth.userId, groupId });
      if (!current.ok || !current.canManage) return res.status(403).json({ error: 'Forbidden' });
      const metadata = await db.from('school_group_material_files').delete()
        .eq('group_id', groupId).eq('object_name', objectName).select('id');
      if (metadata.error) throw metadata.error;
      if (!metadata.data?.length) return res.status(404).json({ error: 'File not found' });
      const removed = await db.storage.from(SCHOOL_GROUP_MATERIAL_BUCKET).remove([`${groupId}/${objectName}`]);
      if (removed.error) throw removed.error;
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('[school-group-materials] failed', (error as Error).message);
    return res.status(503).json({ error: 'school_group_materials_unavailable' });
  }
}
