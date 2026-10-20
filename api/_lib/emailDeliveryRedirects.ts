/** Delivery addresses are separate from Auth logins and signed guardian evidence.
 * Only operators may configure this server-only exact-address map. Never read
 * redirects from a request, user_metadata, or mutable student contact fields. */
function redirectsFromEnvironment(): Map<string, string> {
  const raw = process.env.EMAIL_DELIVERY_REDIRECTS?.trim();
  const redirects = new Map<string, string>();
  if (!raw) return redirects;
  const invalid = () => new Error('Invalid EMAIL_DELIVERY_REDIRECTS configuration');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw invalid(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const emailPattern = /^[^\s@<>,;*]+@[^\s@<>,;*]+\.[^\s@<>,;*]+$/;
  for (const [source, destination] of Object.entries(value)) {
    if (typeof destination !== 'string') throw invalid();
    const from = source.trim().toLowerCase();
    const to = destination.trim().toLowerCase();
    if (!emailPattern.test(from) || !emailPattern.test(to) || redirects.has(from)) throw invalid();
    if (from !== to) redirects.set(from, to);
  }
  // Reject chains/cycles so a configured destination is always the final inbox.
  if ([...redirects.values()].some((to) => redirects.has(to))) throw invalid();
  return redirects;
}

function mailbox(value: string): { address: string; label?: string } {
  const match = /^([^<>\r\n]*)<([^<>\s]+@[^<>\s]+)>$/.exec(value.trim());
  return match ? { address: match[2].toLowerCase(), label: match[1].trim() }
    : { address: value.trim().toLowerCase() };
}

/** Auth recovery uses this to choose custom delivery while retaining its login. */
export function emailDeliveryRedirect(address: string): string | null {
  return redirectsFromEnvironment().get(mailbox(address).address) || null;
}

type Recipients = { to: string | string[]; cc?: string | string[]; bcc?: string | string[] };

/** Runs at the provider boundary, including frozen/queued email retries. */
export function redirectEmailDelivery<T extends Recipients>(payload: T): T {
  const redirects = redirectsFromEnvironment();
  if (!redirects.size) return payload;
  const result = { ...payload };
  const seen = new Set<string>();
  for (const field of ['to', 'cc', 'bcc'] as const) {
    const original = payload[field];
    if (original === undefined) continue;
    const recipients: string[] = [];
    for (const value of Array.isArray(original) ? original : [original]) {
      const parsed = mailbox(value);
      const destination = redirects.get(parsed.address);
      const address = destination || parsed.address;
      if (seen.has(address)) continue;
      seen.add(address);
      recipients.push(destination ? (parsed.label ? `${parsed.label} <${destination}>` : destination) : value);
    }
    if (recipients.length) result[field] = Array.isArray(original) ? recipients : recipients[0];
    else if (field !== 'to') delete result[field];
  }
  return result;
}
