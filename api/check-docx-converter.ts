import type { VercelRequest, VercelResponse } from './types';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';

const execFileAsync = promisify(execFile);

function sofficeCandidates(): string[] {
  const fromEnv = process.env.LIBREOFFICE_PATH ? [process.env.LIBREOFFICE_PATH] : [];
  return [
    ...fromEnv,
    'soffice',
    'soffice.exe',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ];
}

async function detectLibreOffice() {
  const attempts: Array<{ bin: string; ok: boolean; output?: string; error?: string }> = [];

  for (const bin of sofficeCandidates()) {
    const isAbsolute = /^[a-zA-Z]:\\/.test(bin) || bin.startsWith('/');
    if (isAbsolute) {
      try {
        await fs.access(bin);
        attempts.push({ bin, ok: true, output: 'binary found on disk' });
        return { available: true, binary: bin, output: 'binary found on disk', attempts };
      } catch {
        attempts.push({ bin, ok: false, error: 'binary not found on disk' });
        continue;
      }
    }

    try {
      const result = await execFileAsync(bin, ['--version'], {
        windowsHide: true,
        timeout: 20000,
      });
      const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
      attempts.push({ bin, ok: true, output });
      return { available: true, binary: bin, output, attempts };
    } catch (error: any) {
      attempts.push({ bin, ok: false, error: error?.message || 'failed' });
    }
  }

  return { available: false, binary: null, output: '', attempts };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const libreOffice = await detectLibreOffice();
  const hasConvertApiSecret = Boolean(process.env.CONVERTAPI_SECRET);

  const primaryMode = libreOffice.available
    ? 'libreoffice'
    : hasConvertApiSecret
      ? 'convertapi'
      : 'none';

  return res.status(200).json({
    ok: primaryMode !== 'none',
    primaryMode,
    libreOffice,
    hasConvertApiSecret,
    envHints: {
      libreOfficePath: process.env.LIBREOFFICE_PATH || null,
      convertApiSecretConfigured: hasConvertApiSecret,
    },
    recommendation:
      primaryMode === 'libreoffice'
        ? 'Ready: using free local LibreOffice conversion.'
        : primaryMode === 'convertapi'
          ? 'LibreOffice not detected. Fallback to ConvertAPI is available.'
          : 'No converter available. Install LibreOffice or configure CONVERTAPI_SECRET.',
  });
}
