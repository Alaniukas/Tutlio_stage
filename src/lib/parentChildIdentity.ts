import { isPendingChildName } from './pendingChildName.js';
import { isMoksloVaisiaiOrg } from './marketMoney.js';

function normalizeChildIdentity(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('lt')
    : '';
}

/** Compare only children already linked to this parent; never merge by payer email. */
export function findExistingParentChild<T extends { full_name?: unknown; detached_at?: unknown }>(children: T[], fullName: string): T | undefined {
  const wanted = normalizeChildIdentity(fullName);
  if (!wanted) return undefined;
  return children.find(child => !child.detached_at && normalizeChildIdentity(child.full_name) === wanted);
}

type ParentChildRow = {
  id?: unknown;
  full_name?: unknown;
  tutor_id?: unknown;
  organization_id?: unknown;
  linked_user_id?: unknown;
  email?: unknown;
  detached_at?: unknown;
};

function parentChildRowScore(row: ParentChildRow): number {
  return (row.linked_user_id ? 4 : 0) + (normalizeChildIdentity(row.email) ? 2 : 0);
}

/** Hide exact historical Mokslo vaisiai retry duplicates, while retaining one row per tutor. */
export function dedupeParentChildren<T extends ParentChildRow>(children: T[]): T[] {
  const result: T[] = [];
  const indexByKey = new Map<string, number>();

  for (const child of children) {
    if (child.detached_at) continue;
    const id = normalizeChildIdentity(child.id);
    const name = normalizeChildIdentity(child.full_name);
    const canDedupe = isMoksloVaisiaiOrg(normalizeChildIdentity(child.organization_id));
    const key = !canDedupe
      || !name
      || isPendingChildName(typeof child.full_name === 'string' ? child.full_name : null)
      ? `row:${id}`
      : [
          normalizeChildIdentity(child.organization_id) || 'no-org',
          normalizeChildIdentity(child.tutor_id) || 'no-tutor',
          name,
        ].join(':');
    const existingIndex = indexByKey.get(key);
    if (existingIndex == null) {
      indexByKey.set(key, result.length);
      result.push(child);
    } else if (parentChildRowScore(child) > parentChildRowScore(result[existingIndex])) {
      result[existingIndex] = child;
    }
  }

  return result;
}
