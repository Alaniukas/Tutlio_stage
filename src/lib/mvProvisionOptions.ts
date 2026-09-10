export type MvEmailDelivery = 'separate' | 'parent_both';

export type MvProvisionDeliveryInput = {
  emailDelivery?: MvEmailDelivery | null;
  parentAccountEmail: string;
  studentAccountEmail: string;
  parentNotifyEmail?: string | null;
  studentNotifyEmail?: string | null;
  bothNotifyEmail?: string | null;
};

export type MvProvisionNotifyTargets = {
  parentTo: string;
  studentTo: string;
};

function normalizeEmail(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

function pickNotifyEmail(override: string | null | undefined, fallback: string): string {
  const chosen = normalizeEmail(override);
  return chosen || normalizeEmail(fallback);
}

/** Resolves where activation emails are delivered (account emails may differ). */
export function resolveMvNotifyTargets(input: MvProvisionDeliveryInput): MvProvisionNotifyTargets {
  const parentAccount = normalizeEmail(input.parentAccountEmail);
  const studentAccount = normalizeEmail(input.studentAccountEmail);
  const studentFallback = studentAccount || parentAccount;
  const delivery: MvEmailDelivery = input.emailDelivery === 'parent_both' ? 'parent_both' : 'separate';

  if (delivery === 'parent_both') {
    const bothTo = pickNotifyEmail(input.bothNotifyEmail ?? input.parentNotifyEmail, parentAccount);
    return { parentTo: bothTo, studentTo: bothTo };
  }

  return {
    parentTo: pickNotifyEmail(input.parentNotifyEmail, parentAccount),
    studentTo: pickNotifyEmail(input.studentNotifyEmail, studentFallback),
  };
}

export function defaultMvProvisionDelivery(): {
  emailDelivery: MvEmailDelivery;
  parentNotifyEmail: string;
  studentNotifyEmail: string;
  bothNotifyEmail: string;
} {
  return {
    emailDelivery: 'separate',
    parentNotifyEmail: '',
    studentNotifyEmail: '',
    bothNotifyEmail: '',
  };
}
