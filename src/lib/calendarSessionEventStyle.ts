export type CalendarSessionStyleInput = {
  status: string;
  paid?: boolean;
  payment_status?: string | null;
  endAt: Date;
  isTrial?: boolean;
  isMakeup?: boolean;
  cancellationReasonCode?: string | null;
  isMovedLesson?: boolean;
  /** Org tutor: status-only coloring (no payment amber). */
  isOrgTutor?: boolean;
  /** Mokslo vaisiai use a dedicated trial/completed calendar palette. */
  useMoksloVaisiaiPalette?: boolean;
  defaultColor?: string;
};

export const MOKSLO_VAISIAI_CALENDAR_COLORS = {
  trialBackground: '#e5e7eb',
  trialBorder: '#9ca3af',
  trialText: '#374151',
  completedBackground: '#facc15',
  completedText: '#422006',
} as const;

const TRIAL_BG = '#a855f7';
const TRIAL_BORDER = '#7e22ce';
const UNPAID_BG = '#ca8a04';
const PAID_BG = '#10b981';
const ACTIVE_BG = '#3b82f6';
const NO_SHOW_BG = '#fda4af';
const CANCELLED_BG = '#ef4444';
const MAKEUP_BG = '#8b5cf6';
const MAKEUP_BORDER = '#6d28d9';
const TUTOR_NO_SHOW_BORDER = '#991b1b';

export function getCalendarSessionEventStyle(input: CalendarSessionStyleInput): {
  backgroundColor: string;
  border: string;
  borderColor?: string;
  boxShadow?: string;
  opacity?: number;
  color: string;
} {
  const {
    status,
    paid,
    payment_status,
    endAt,
    isTrial,
    isMakeup,
    cancellationReasonCode,
    isMovedLesson,
    isOrgTutor,
    useMoksloVaisiaiPalette,
    defaultColor = ACTIVE_BG,
  } = input;

  if (status === 'cancelled') {
    const tutorNoShow = cancellationReasonCode === 'tutor_no_show';
    return {
      backgroundColor: CANCELLED_BG,
      opacity: 0.55,
      border: tutorNoShow ? '2px dashed #991b1b' : 'none',
      borderColor: tutorNoShow ? TUTOR_NO_SHOW_BORDER : CANCELLED_BG,
      color: '#fff',
    };
  }

  if (status === 'no_show') {
    return {
      backgroundColor: NO_SHOW_BG,
      border: 'none',
      color: '#fff',
    };
  }

  const endMs = endAt instanceof Date ? endAt.getTime() : new Date(endAt as Date).getTime();
  const hasEnded = Number.isFinite(endMs) && endMs <= Date.now();
  const isPaid =
    paid === true || payment_status === 'paid' || payment_status === 'confirmed';
  const isMoksloVaisiaiTrial = useMoksloVaisiaiPalette === true && isTrial === true;
  const isMoksloVaisiaiEnded =
    useMoksloVaisiaiPalette === true &&
    !isTrial &&
    (status === 'completed' || (status === 'active' && hasEnded));

  let backgroundColor = defaultColor;

  if (isTrial) {
    backgroundColor = isMoksloVaisiaiTrial
      ? MOKSLO_VAISIAI_CALENDAR_COLORS.trialBackground
      : TRIAL_BG;
  } else if (isMoksloVaisiaiEnded) {
    backgroundColor = MOKSLO_VAISIAI_CALENDAR_COLORS.completedBackground;
  } else if (isOrgTutor) {
    if (status === 'completed') {
      backgroundColor = isPaid ? PAID_BG : UNPAID_BG;
    } else if (status === 'active' && hasEnded) {
      backgroundColor = UNPAID_BG;
    } else {
      backgroundColor = ACTIVE_BG;
    }
  } else {
    const unpaidOccurred =
      (status === 'completed' && !isPaid) ||
      (status === 'active' && hasEnded && !isPaid) ||
      (hasEnded && payment_status === 'paid_by_student');

    if (unpaidOccurred) {
      backgroundColor = UNPAID_BG;
    } else if (isPaid || status === 'completed') {
      backgroundColor = PAID_BG;
    } else {
      backgroundColor = ACTIVE_BG;
    }
  }

  if (isMakeup && status !== 'cancelled') {
    return {
      backgroundColor: MAKEUP_BG,
      border: '2px solid #6d28d9',
      borderColor: MAKEUP_BORDER,
      color: '#fff',
      boxShadow: 'inset 0 0 0 9999px rgba(109, 40, 217, 0.12)',
    };
  }

  if (isMovedLesson) {
    return {
      backgroundColor,
      border: '2px dashed #f59e0b',
      boxShadow: 'inset 0 0 0 9999px rgba(245, 158, 11, 0.18)',
      color: isMoksloVaisiaiEnded
        ? MOKSLO_VAISIAI_CALENDAR_COLORS.completedText
        : '#fff',
    };
  }

  if (isTrial) {
    return {
      backgroundColor,
      border: isMoksloVaisiaiTrial
        ? `2px solid ${MOKSLO_VAISIAI_CALENDAR_COLORS.trialBorder}`
        : '2px solid #7e22ce',
      borderColor: isMoksloVaisiaiTrial
        ? MOKSLO_VAISIAI_CALENDAR_COLORS.trialBorder
        : TRIAL_BORDER,
      boxShadow: isMoksloVaisiaiTrial
        ? 'inset 0 0 0 9999px rgba(107, 114, 128, 0.05)'
        : 'inset 0 0 0 9999px rgba(126, 34, 206, 0.15)',
      color: isMoksloVaisiaiTrial
        ? MOKSLO_VAISIAI_CALENDAR_COLORS.trialText
        : '#fff',
    };
  }

  return {
    backgroundColor,
    border: 'none',
    color: isMoksloVaisiaiEnded
      ? MOKSLO_VAISIAI_CALENDAR_COLORS.completedText
      : '#fff',
  };
}

export function calendarSessionTitlePrefix(input: {
  isTrial?: boolean;
  isMakeup?: boolean;
  cancellationReasonCode?: string | null;
  status?: string;
}): string {
  const parts: string[] = [];
  if (input.isMakeup) parts.push('↻');
  if (input.isTrial) parts.push('★');
  if (input.status === 'cancelled' && input.cancellationReasonCode === 'tutor_no_show') {
    parts.push('⊘');
  }
  return parts.length > 0 ? `${parts.join(' ')} ` : '';
}
