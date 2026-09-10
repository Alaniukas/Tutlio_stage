export type MvStudentAccountRow = {
  email?: string | null;
  payer_email?: string | null;
  payer_name?: string | null;
  full_name?: string | null;
  linked_user_id?: string | null;
  parent_user_id?: string | null;
};

function validEmail(value?: string | null): boolean {
  const email = (value || '').trim();
  return email.includes('@');
}

export function mvNeedsStudentAccount(row: MvStudentAccountRow): boolean {
  return !row.linked_user_id && validEmail(row.email);
}

export function mvNeedsParentAccount(row: MvStudentAccountRow): boolean {
  return !row.parent_user_id && validEmail(row.payer_email);
}

export function mvNeedsAnyAccountProvisioning(row: MvStudentAccountRow): boolean {
  return mvNeedsStudentAccount(row) || mvNeedsParentAccount(row);
}
