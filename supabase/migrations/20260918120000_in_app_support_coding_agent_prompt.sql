alter table public.in_app_support_requests
  add column if not exists coding_agent_prompt text;

comment on column public.in_app_support_requests.coding_agent_prompt is
  'Ready-to-paste AI coding-agent prompt generated from the structured report, technical context, and full support transcript.';
