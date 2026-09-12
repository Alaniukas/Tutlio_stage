import { BLOG_FAQ_LABEL } from './blogMarkets.js';

export interface BlogFaqItem {
  question: string;
  answer: string;
}

const FAQ_HEADINGS = new Set([
  'faq',
  ...Object.values(BLOG_FAQ_LABEL).map((heading) => heading.toLocaleLowerCase()),
]);

function isFaqHeading(value: string): boolean {
  return FAQ_HEADINGS.has(value.trim().replace(/[:：]\s*$/, '').toLocaleLowerCase());
}

/**
 * Pull reader-facing Q&A pairs from a markdown FAQ section. The JSON-LD keeps
 * the page semantics explicit, but is not treated as a special AI-search hack
 * (Google normally limits FAQ rich results to authoritative health/government sites).
 * Expected shape: ## FAQ / DUK, then ### Question followed by answer paragraphs.
 */
export function extractBlogFaqs(markdown: string, limit = 6): BlogFaqItem[] {
  const lines = String(markdown || '').split(/\r?\n/);
  let inFaq = false;
  const items: BlogFaqItem[] = [];
  let question = '';
  let answer: string[] = [];

  const flush = () => {
    const q = question.trim();
    const a = answer.join(' ').replace(/\s+/g, ' ').trim();
    if (q && a) items.push({ question: q.endsWith('?') ? q : `${q}?`, answer: a });
    question = '';
    answer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      if (inFaq) flush();
      inFaq = isFaqHeading(h2[1]);
      continue;
    }
    if (!inFaq) continue;
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      flush();
      question = h3[1].trim();
      continue;
    }
    if (line.startsWith('#')) {
      flush();
      inFaq = false;
      continue;
    }
    if (question && line) answer.push(line.replace(/^[-*]\s+/, ''));
  }
  if (inFaq) flush();
  return items.slice(0, limit);
}

export function blogFaqJsonLd(items: BlogFaqItem[]) {
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
