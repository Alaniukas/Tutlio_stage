import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const MAX_SIZE = 5 * 1024 * 1024;

export async function uploadBlogImageBuffer(
  supabase: SupabaseClient,
  buffer: Buffer,
  contentType: string,
  fileName = 'cover',
): Promise<string> {
  if (!ALLOWED_TYPES[contentType]) {
    throw new Error(`Unsupported image type: ${contentType}`);
  }
  if (buffer.length > MAX_SIZE) {
    throw new Error('Image too large (max 5 MB)');
  }

  const ext = ALLOWED_TYPES[contentType];
  const safeName = fileName.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'cover';
  const path = `${randomUUID()}-${safeName}${ext}`;

  const { error } = await supabase.storage
    .from('blog-images')
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('blog-images').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadBlogImageFromBase64(
  supabase: SupabaseClient,
  base64: string,
  contentType: string,
  fileName?: string,
): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  return uploadBlogImageBuffer(supabase, buffer, contentType, fileName);
}

export async function uploadBlogImageFromUrl(
  supabase: SupabaseClient,
  imageUrl: string,
  fileName?: string,
): Promise<string> {
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`Failed to fetch cover image: ${resp.status}`);
  const contentType = resp.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
  const buffer = Buffer.from(await resp.arrayBuffer());
  return uploadBlogImageBuffer(supabase, buffer, contentType, fileName);
}
