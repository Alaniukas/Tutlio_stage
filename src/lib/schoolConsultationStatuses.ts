export const CONSULTATION_STATUSES = [
  'submitted',
  'awaiting_proposal',
  'proposed',
  'awaiting_parent_confirm',
  'confirmed',
  'awaiting_payment',
  'occurred',
  'cancelled_parent',
  'cancelled_staff',
  'no_show',
] as const;

export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

export const CONSULTATION_STATUS_I18N: Record<ConsultationStatus, string> = {
  submitted: 'schoolConsult.status.submitted',
  awaiting_proposal: 'schoolConsult.status.awaitingProposal',
  proposed: 'schoolConsult.status.proposed',
  awaiting_parent_confirm: 'schoolConsult.status.awaitingParentConfirm',
  confirmed: 'schoolConsult.status.confirmed',
  awaiting_payment: 'schoolConsult.status.awaitingPayment',
  occurred: 'schoolConsult.status.occurred',
  cancelled_parent: 'schoolConsult.status.cancelledParent',
  cancelled_staff: 'schoolConsult.status.cancelledStaff',
  no_show: 'schoolConsult.status.noShow',
};

export const REQUEST_STATUSES = [
  'submitted',
  'awaiting_proposal',
  'proposed',
  'awaiting_parent_confirm',
  'confirmed',
  'cancelled_parent',
  'cancelled_staff',
  'completed',
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_STATUS_I18N: Record<RequestStatus, string> = {
  submitted: 'schoolConsult.status.submitted',
  awaiting_proposal: 'schoolConsult.status.awaitingProposal',
  proposed: 'schoolConsult.status.proposed',
  awaiting_parent_confirm: 'schoolConsult.status.awaitingParentConfirm',
  confirmed: 'schoolConsult.status.confirmed',
  cancelled_parent: 'schoolConsult.status.cancelledParent',
  cancelled_staff: 'schoolConsult.status.cancelledStaff',
  completed: 'schoolConsult.status.occurred',
};
