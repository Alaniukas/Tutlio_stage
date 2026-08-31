create table public.support_conversations (
  session_id text primary key,
  locale text not null default 'en',
  first_page text not null default '/',
  last_page text not null default '/',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint support_conversations_session_id_length
    check (char_length(session_id) between 8 and 100),
  constraint support_conversations_locale_length
    check (char_length(locale) between 2 and 12),
  constraint support_conversations_first_page_length
    check (char_length(first_page) between 1 and 300),
  constraint support_conversations_last_page_length
    check (char_length(last_page) between 1 and 300)
);

comment on table public.support_conversations is
  'Server-only support AI conversation metadata used for product-support analysis.';

create table public.support_messages (
  id bigint generated always as identity primary key,
  session_id text not null references public.support_conversations(session_id) on delete cascade,
  request_id text not null,
  role text not null,
  content text not null,
  model text,
  knowledge_area text,
  suggested_page_ids text[] not null default '{}'::text[],
  token_usage jsonb,
  page text not null default '/',
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  constraint support_messages_request_id_length
    check (char_length(request_id) between 8 and 100),
  constraint support_messages_role
    check (role in ('user', 'assistant')),
  constraint support_messages_content_length
    check (char_length(content) between 1 and 8000),
  constraint support_messages_model_length
    check (model is null or char_length(model) between 1 and 100),
  constraint support_messages_knowledge_area_length
    check (knowledge_area is null or char_length(knowledge_area) between 1 and 100),
  constraint support_messages_page_length
    check (char_length(page) between 1 and 300),
  constraint support_messages_locale_length
    check (char_length(locale) between 2 and 12),
  constraint support_messages_token_usage_object
    check (token_usage is null or jsonb_typeof(token_usage) = 'object'),
  unique (session_id, request_id, role)
);

comment on table public.support_messages is
  'Server-only user and assistant messages, including routing and token-usage metadata.';

create index support_messages_session_created_idx
  on public.support_messages (session_id, created_at desc);

create index support_messages_created_idx
  on public.support_messages (created_at desc);

create index support_messages_knowledge_area_created_idx
  on public.support_messages (knowledge_area, created_at desc)
  where knowledge_area is not null;

create table public.support_contact_requests (
  id bigint generated always as identity primary key,
  request_id text not null unique,
  session_id text references public.support_conversations(session_id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  message text not null,
  page text not null default '/',
  locale text not null default 'en',
  attachment_path text,
  attachment_name text,
  attachment_type text,
  attachment_size integer,
  delivery_status text not null default 'pending',
  resend_email_id text,
  created_at timestamptz not null default now(),
  constraint support_contact_requests_request_id_length
    check (char_length(request_id) between 8 and 100),
  constraint support_contact_requests_name_length
    check (char_length(name) between 1 and 100),
  constraint support_contact_requests_email_length
    check (char_length(email) between 3 and 200),
  constraint support_contact_requests_phone_length
    check (phone is null or char_length(phone) between 1 and 50),
  constraint support_contact_requests_message_length
    check (char_length(message) between 10 and 4000),
  constraint support_contact_requests_page_length
    check (char_length(page) between 1 and 300),
  constraint support_contact_requests_locale_length
    check (char_length(locale) between 2 and 12),
  constraint support_contact_requests_attachment_consistency
    check (
      (attachment_path is null and attachment_name is null and attachment_type is null and attachment_size is null)
      or
      (
        attachment_path is not null
        and attachment_name is not null
        and attachment_type in ('image/png', 'image/jpeg', 'image/webp')
        and attachment_size between 1 and 5242880
      )
    ),
  constraint support_contact_requests_delivery_status
    check (delivery_status in ('pending', 'sent', 'failed'))
);

comment on table public.support_contact_requests is
  'Server-only support contact submissions linked to the originating AI conversation when available.';

create index support_contact_requests_created_idx
  on public.support_contact_requests (created_at desc);

create index support_contact_requests_session_created_idx
  on public.support_contact_requests (session_id, created_at desc)
  where session_id is not null;

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_contact_requests enable row level security;

revoke all on table public.support_conversations from public, anon, authenticated;
revoke all on table public.support_messages from public, anon, authenticated;
revoke all on table public.support_contact_requests from public, anon, authenticated;

grant select, insert, update, delete on table public.support_conversations to service_role;
grant select, insert, update, delete on table public.support_messages to service_role;
grant select, insert, update, delete on table public.support_contact_requests to service_role;
grant usage, select on sequence public.support_messages_id_seq to service_role;
grant usage, select on sequence public.support_contact_requests_id_seq to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
