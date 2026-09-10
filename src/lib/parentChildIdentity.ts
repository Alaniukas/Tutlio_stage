/** Compare only children already linked to this parent; never merge by payer email. */
export function findExistingParentChild<T extends { full_name?: unknown; detached_at?: unknown }>(children: T[], fullName: string): T | undefined {
  const normalize = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('lt');
  const wanted = normalize(fullName);
  if (!wanted) return undefined;
  return children.find(child => !child.detached_at && typeof child.full_name === 'string' && normalize(child.full_name) === wanted);
}
