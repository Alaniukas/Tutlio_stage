export type LessonRescheduleApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

export type LessonRescheduleApprovalPreview = {
  status: LessonRescheduleApprovalStatus;
  recipientApproved: boolean;
  scope: 'single' | 'future';
  organizationName: string;
  brandColor: string;
  tutorName: string;
  studentName: string;
  oldStart: string;
  oldEnd: string;
  newStart: string;
  newEnd: string;
  reason: string;
  locale: string;
};

export type TutorLessonRescheduleRequest = {
  id: string;
  sessionIds: string[];
  status: LessonRescheduleApprovalStatus;
  scope: 'single' | 'future';
};

export function effectiveLessonRescheduleStatus(
  status: LessonRescheduleApprovalStatus, expiresAt: string, now = Date.now(),
): LessonRescheduleApprovalStatus {
  return status === 'pending' && Date.parse(expiresAt) <= now ? 'expired' : status;
}
