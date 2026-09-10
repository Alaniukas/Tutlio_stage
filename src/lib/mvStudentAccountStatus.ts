export type MvStudentAccountRow = {
  id?: string;
  tutor_id?: string | null;
  email?: string | null;
  payer_email?: string | null;
  payer_name?: string | null;
  full_name?: string | null;
  linked_user_id?: string | null;
  parent_user_id?: string | null;
};

export function mvNeedsStudentAccount(row: MvStudentAccountRow): boolean {
  return !row.linked_user_id;
}

export function mvNeedsParentAccount(row: MvStudentAccountRow): boolean {
  return !row.parent_user_id;
}

export function mvNeedsAnyAccountProvisioning(row: MvStudentAccountRow): boolean {
  return mvNeedsStudentAccount(row) || mvNeedsParentAccount(row);
}

function accountRowScore(row: MvStudentAccountRow): number {
  return (row.linked_user_id ? 8 : 0)
    + (row.parent_user_id ? 4 : 0)
    + ((row.email || '').trim() ? 2 : 0)
    + ((row.payer_email || '').trim() ? 1 : 0);
}

/**
 * One organization child normally has one row per tutor. Historical retries may
 * have created exact duplicates for the same tutor; never provision those as if
 * they represented a second tutor relationship.
 */
export function mvProvisionStudentIds(rows: MvStudentAccountRow[]): string[] {
  const bestByTutor = new Map<string, MvStudentAccountRow>();
  for (const row of rows) {
    if (!row.id) continue;
    const key = row.tutor_id || `row:${row.id}`;
    const current = bestByTutor.get(key);
    if (!current || accountRowScore(row) > accountRowScore(current)) {
      bestByTutor.set(key, row);
    }
  }
  return [...bestByTutor.values()].map((row) => row.id!).filter(Boolean);
}

/** Account links may live on different tutor rows representing the same child. */
export function mergeMvStudentAccountStatus(rows: MvStudentAccountRow[]): MvStudentAccountRow {
  const first = rows[0] || {};
  const withStudent = rows.find((row) => row.linked_user_id);
  const withParent = rows.find((row) => row.parent_user_id);
  const withStudentEmail = rows.find((row) => (row.email || '').trim());
  const withPayerEmail = rows.find((row) => (row.payer_email || '').trim());
  const withPayerName = rows.find((row) => (row.payer_name || '').trim());
  const withFullName = rows.find((row) => (row.full_name || '').trim());

  return {
    ...first,
    linked_user_id: withStudent?.linked_user_id || null,
    parent_user_id: withParent?.parent_user_id || null,
    email: withStudentEmail?.email || first.email || null,
    payer_email: withPayerEmail?.payer_email || first.payer_email || null,
    payer_name: withPayerName?.payer_name || first.payer_name || null,
    full_name: withFullName?.full_name || first.full_name || null,
  };
}
