export type MvProvisionAccountPayload = {
  email: string;
  password?: string;
  userId: string;
  created: boolean;
  reused?: boolean;
  emailSent: boolean;
  emailError?: string;
  activationUrl: string;
  notifyEmail?: string;
};

export type MvProvisionRequestBody = {
  studentId: string;
  studentIds?: string[];
  parentName?: string;
  parentEmail?: string;
  studentFullName?: string;
  studentEmail?: string;
  locale?: string;
  scope?: 'auto' | 'both' | 'parent' | 'student';
  emailDelivery?: 'separate' | 'parent_both';
  parentNotifyEmail?: string;
  studentNotifyEmail?: string;
  bothNotifyEmail?: string;
};

export type MvProvisionApiResponse = {
  success: boolean;
  parent?: MvProvisionAccountPayload | null;
  student?: MvProvisionAccountPayload | null;
  error?: string;
  code?: string;
};

export type MvProvisionCredentialsView = {
  parent?: MvProvisionAccountPayload;
  student?: MvProvisionAccountPayload;
  students?: MvProvisionAccountPayload[];
};

export function credentialsFromProvisionResponse(json: MvProvisionApiResponse): MvProvisionCredentialsView | null {
  if (!json.success) return null;
  if (!json.parent && !json.student) return null;
  return {
    parent: json.parent || undefined,
    student: json.student || undefined,
  };
}

export function provisionEmailsSent(view: MvProvisionCredentialsView | null): boolean {
  if (!view) return false;
  const newlyCreated = [view.parent, ...studentAccountsFromCredentials(view)].filter(
    (account): account is MvProvisionAccountPayload => Boolean(account?.created),
  );
  return newlyCreated.length > 0 && newlyCreated.every((account) => account.emailSent);
}

export function studentAccountsFromCredentials(
  view: MvProvisionCredentialsView | null,
): MvProvisionAccountPayload[] {
  if (!view) return [];
  if (view.students?.length) return view.students;
  return view.student ? [view.student] : [];
}

export async function postMvProvisionFamilyAccounts(
  body: MvProvisionRequestBody,
  authHeadersFn: () => Promise<HeadersInit>,
): Promise<{ ok: true; json: MvProvisionApiResponse } | { ok: false; json: MvProvisionApiResponse; status: number }> {
  const res = await fetch('/api/mv-provision-family-accounts', {
    method: 'POST',
    headers: await authHeadersFn(),
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as MvProvisionApiResponse;
  if (!res.ok) return { ok: false, json, status: res.status };
  return { ok: true, json };
}
