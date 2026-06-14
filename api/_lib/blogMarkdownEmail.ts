/** Minimal markdown → email-safe HTML (headings, lists, bold, paragraphs). */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export function markdownToEmailHtml(markdown: string): string {
  const lines = String(markdown || '').split('\n');
  const chunks: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      chunks.push('</ul>');
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      continue;
    }

    if (trimmed.startsWith('### ')) {
      closeList();
      chunks.push(
        `<h4 style="font-size:15px;font-weight:700;color:#111827;margin:20px 0 8px;">${inlineMarkdown(trimmed.slice(4))}</h4>`,
      );
    } else if (trimmed.startsWith('## ')) {
      closeList();
      chunks.push(
        `<h3 style="font-size:17px;font-weight:700;color:#111827;margin:24px 0 10px;">${inlineMarkdown(trimmed.slice(3))}</h3>`,
      );
    } else if (trimmed.startsWith('# ')) {
      closeList();
      chunks.push(
        `<h2 style="font-size:19px;font-weight:700;color:#111827;margin:24px 0 10px;">${inlineMarkdown(trimmed.slice(2))}</h2>`,
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        chunks.push('<ul style="margin:0 0 12px 20px;padding:0;color:#374151;font-size:14px;line-height:1.6;">');
        inList = true;
      }
      chunks.push(`<li style="margin-bottom:6px;">${inlineMarkdown(trimmed.slice(2))}</li>`);
    } else {
      closeList();
      chunks.push(
        `<p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.7;">${inlineMarkdown(trimmed)}</p>`,
      );
    }
  }

  closeList();
  return chunks.join('');
}
