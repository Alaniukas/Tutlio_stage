export interface BlogTocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'section';
}

/** Extract h2/h3 headings from markdown for sidebar TOC. */
export function extractBlogToc(markdown: string): BlogTocItem[] {
  const items: BlogTocItem[] = [];
  const used = new Map<string, number>();

  for (const line of markdown.split('\n')) {
    const m = line.match(/^(#{2,3})\s+(.+)$/);
    if (!m) continue;
    const level = m[1].length as 2 | 3;
    const text = m[2].replace(/\*\*(.+?)\*\*/g, '$1').trim();
    if (!text) continue;

    let id = slugifyHeading(text);
    const n = (used.get(id) || 0) + 1;
    used.set(id, n);
    if (n > 1) id = `${id}-${n}`;

    items.push({ id, text, level });
  }
  return items;
}

/** Inject id attributes into h2/h3 for anchor links. */
export function injectHeadingIds(html: string, toc: BlogTocItem[]): string {
  if (!toc.length) return html;
  let i = 0;
  return html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (match, level, inner) => {
    const item = toc[i];
    if (!item || String(level) !== String(item.level)) return match;
    i++;
    return `<h${level} id="${item.id}">${inner}</h${level}>`;
  });
}
