alter table public.in_app_support_requests
  add column if not exists team_notified_at timestamptz,
  add column if not exists team_notification_email_id text,
  add column if not exists team_notification_error text;

comment on column public.in_app_support_requests.team_notified_at is
  'When the initial support report was accepted by the team email provider; used to suppress duplicate sends on request ID retry.';
comment on column public.in_app_support_requests.team_notification_email_id is
  'Resend delivery identifier for the initial team notification.';
comment on column public.in_app_support_requests.team_notification_error is
  'Last initial team notification failure, retained for an administrator to retry.';
