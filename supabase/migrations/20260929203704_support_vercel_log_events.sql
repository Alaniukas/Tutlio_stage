-- Durable, privacy-limited warning/error diagnostics for support request IDs.
-- Ingestion is restricted to a signed Vercel Log Drain and one configured project.
create table if not exists public.support_vercel_log_events (
  project_id text not null,
  log_id text not null,
  vercel_id text not null,
  occurred_at timestamptz not null,
  level text not null,
  source text not null,
  method text,
  path text,
  status_code integer,
  message text,
  created_at timestamptz not null default now(),
  primary key (project_id, log_id),
  constraint support_vercel_log_events_project_length check (char_length(project_id) between 1 and 100),
  constraint support_vercel_log_events_log_id_length check (char_length(log_id) between 1 and 128),
  constraint support_vercel_log_events_vercel_id_length check (char_length(vercel_id) between 1 and 128),
  constraint support_vercel_log_events_level check (level in ('warning', 'error', 'fatal')),
  constraint support_vercel_log_events_source_length check (char_length(source) between 1 and 32),
  constraint support_vercel_log_events_method_length check (method is null or char_length(method) between 1 and 12),
  constraint support_vercel_log_events_path_length check (path is null or char_length(path) between 1 and 300),
  constraint support_vercel_log_events_status_code check (status_code is null or status_code between 100 and 599),
  constraint support_vercel_log_events_message_length check (message is null or char_length(message) between 1 and 500)
);

comment on table public.support_vercel_log_events is
  'Bounded Vercel warning/error metadata correlated by proxy.vercelId; excludes IP, user-agent, query strings, and request bodies.';

create index if not exists support_vercel_log_events_lookup_idx
  on public.support_vercel_log_events (vercel_id, occurred_at desc);

create index if not exists support_vercel_log_events_retention_idx
  on public.support_vercel_log_events (occurred_at);

alter table public.support_vercel_log_events enable row level security;
revoke all on table public.support_vercel_log_events from public, anon, authenticated;
grant select, insert, update, delete on table public.support_vercel_log_events to service_role;
