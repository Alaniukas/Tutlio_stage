import { authHeaders } from '@/lib/apiHelpers';

export type CancelSessionParams = {
    sessionId: string;
    tutorId: string;
    reason: string;
    cancelledBy: 'tutor' | 'student';
    studentName: string;
    tutorName: string;
    studentEmail: string | null;
    tutorEmail: string | null;
    cancellationHours?: number;
    cancellationFeePercent?: number;
    payerEmail?: string | null;
    penaltyPaidViaStripe?: boolean;
    /** Tutor cancel: when true, freed slot becomes bookable availability for other students */
    leaveFreeTime?: boolean;
};

export type ReleaseSessionSlotParams = {
    tutorId: string;
    startTime: string;
    endTime: string;
    subjectId?: string | null;
};

/**
 * Cancel via POST /api/cancel-session (service role).
 * Server handles: DB update, group spots, package credits, penalties, emails,
 * waitlist auto-fill (with day/time preference matching), Google Calendar delete.
 * All tutor/student/org-admin UIs should use this — not direct Supabase updates.
 */
export type CancelSessionApiResult = {
    success: boolean;
    error?: string;
    needsPenaltyChoice?: boolean;
    penaltyAmount?: number;
    isLate?: boolean;
};

export async function cancelSessionViaApi(
    params: CancelSessionParams
): Promise<CancelSessionApiResult> {
    try {
        const res = await fetch('/api/cancel-session', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify(params),
        });
        const json = (await res.json().catch(() => ({}))) as {
            success?: boolean;
            error?: string;
            needsPenaltyChoice?: boolean;
            penaltyAmount?: number;
            isLate?: boolean;
        };
        if (res.ok && json.success) {
            return {
                success: true,
                needsPenaltyChoice: json.needsPenaltyChoice,
                penaltyAmount: json.penaltyAmount,
                isLate: json.isLate,
            };
        }
        const message =
            typeof json.error === 'string'
                ? json.error
                : res.status === 401
                  ? 'Unauthorized'
                  : res.status === 403
                    ? 'Forbidden'
                    : 'Failed to cancel session';
        return { success: false, error: message };
    } catch (e) {
        console.error('[cancelSessionViaApi]', e);
        return {
            success: false,
            error: e instanceof Error ? e.message : 'Network error',
        };
    }
}

/** @deprecated Use cancelSessionViaApi — kept as alias for existing imports */
export async function cancelSessionAndFillWaitlist(params: CancelSessionParams) {
    return cancelSessionViaApi(params);
}

/** After tutor reschedule: optionally release the old lesson time as one-time availability. */
export async function releaseSessionSlotViaApi(
    params: ReleaseSessionSlotParams,
): Promise<{ success: boolean; created?: boolean; error?: string }> {
    try {
        const res = await fetch('/api/release-session-slot', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify(params),
        });
        const json = (await res.json().catch(() => ({}))) as {
            success?: boolean;
            created?: boolean;
            error?: string;
        };
        if (res.ok && json.success) {
            return { success: true, created: json.created };
        }
        return {
            success: false,
            error: typeof json.error === 'string' ? json.error : 'Failed to release slot',
        };
    } catch (e) {
        console.error('[releaseSessionSlotViaApi]', e);
        return {
            success: false,
            error: e instanceof Error ? e.message : 'Network error',
        };
    }
}
