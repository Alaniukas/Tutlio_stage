alter table public.students
  add column if not exists parent_secondary_address text;
