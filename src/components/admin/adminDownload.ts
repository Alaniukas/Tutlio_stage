/** Saves a fetch response as a file, preferring the server-provided filename. */
export async function downloadBlob(res: Response, fallbackName: string) {
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const m = /filename="([^"]+)"/.exec(disposition);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = m?.[1] || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
