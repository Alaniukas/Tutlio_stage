-- Align prod (used boolean) with app code (used_at timestamptz).
alter table public.school_contract_completion_tokens
  add column if not exists used_at timestamptz null;

update public.school_contract_completion_tokens
set used_at = coalesce(used_at, created_at, now())
where coalesce(used, false) = true
  and used_at is null;
