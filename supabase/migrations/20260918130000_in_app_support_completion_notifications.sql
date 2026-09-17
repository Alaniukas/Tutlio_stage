alter table public.in_app_support_requests
  add column if not exists completion_notified_at timestamptz,
  add column if not exists completion_notification_email_id text;

comment on column public.in_app_support_requests.completion_notified_at is
  'When a platform administrator emailed the reporter that the bug was fixed or feature was implemented.';

comment on column public.in_app_support_requests.completion_notification_email_id is
  'Resend delivery identifier for the reporter completion notification.';
