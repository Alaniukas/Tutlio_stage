-- ============================================================
-- TUTLIO – Full consolidated database schema (LAUNCH / MAIN)
-- ============================================================
-- ⚠️⚠️⚠️ SVARBU PRODUKCIJAI ⚠️⚠️⚠️
--
-- ❌ NIEKADA NENAUDOK ŠIO FAILO PRODUCTION/STAGE APLINKOSE!
-- ❌ DROP komandos ištrina VISUS duomenis (users, sessions, payments)!
--
-- ✅ PRODUKCIJAI naudok: supabase db push (migrations)
-- ✅ ŠIS FAILAS TIK: local development / fresh setup
--
-- Jei tikrai nori reset local DB, atkomentuok DROP komandas žemiau.
-- ============================================================

-- =====================================================
-- PART 0: RESET (IŠJUNGTA - SAUGU PRODUCTION)
-- =====================================================
-- ❌ DROP komandos IŠKOMENTUO TOS ❌
-- Jei nori reset local DB, pašalink "//" prieš DROP komandas

-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- DROP FUNCTION IF EXISTS public.handle_new_user();
-- DROP FUNCTION IF EXISTS public.get_student_by_invite_code(text);
-- DROP FUNCTION IF EXISTS public.get_student_by_user_id(uuid);
-- DROP FUNCTION IF EXISTS public.get_student_by_email_for_linking(text);
-- DROP FUNCTION IF EXISTS public.get_student_full_info(uuid);
-- DROP FUNCTION IF EXISTS student_reschedule_session(uuid, timestamptz, timestamptz);
-- DROP FUNCTION IF EXISTS get_student_individual_pricing(uuid);

-- DROP TABLE IF EXISTS public.payments CASCADE;
-- DROP TABLE IF EXISTS public.waitlists CASCADE;
-- DROP TABLE IF EXISTS public.sessions CASCADE;
-- DROP TABLE IF EXISTS public.student_individual_pricing CASCADE;
-- DROP TABLE IF EXISTS public.recurring_individual_sessions CASCADE;
-- DROP TABLE IF EXISTS public.availability CASCADE;
-- DROP TABLE IF EXISTS public.subjects CASCADE;
-- DROP TABLE IF EXISTS public.students CASCADE;
-- DROP TABLE IF EXISTS public.tutor_invites CASCADE;
-- DROP TABLE IF EXISTS public.organization_admins CASCADE;
-- DROP TABLE IF EXISTS public.profiles CASCADE;
-- DROP TABLE IF EXISTS public.organizations CASCADE;

-- =====================================================
-- PART 1: Extensions & base tables
-- =====================================================

create extension if not exists "uuid-ossp";

create table if not exists public.organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL,
  tutor_limit   int  NOT NULL DEFAULT 5,
  created_at    timestamptz NOT NULL DEFAULT now()
);

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  full_name text,
  phone text,
  cancellation_hours integer default 24,
  cancellation_fee_percent integer default 0,
  reminder_student_hours numeric default 2,
  reminder_tutor_hours numeric default 2,
  min_booking_hours integer default 1,
  break_between_lessons integer default 0,
  daily_digest_enabled boolean default true,
  organization_id uuid references public.organizations(id) on delete set null,
  google_calendar_access_token text,
  google_calendar_refresh_token text,
  google_calendar_token_expiry timestamptz,
  google_calendar_connected boolean default false,
  google_calendar_sync_enabled boolean default true,
  payment_timing text default 'before_lesson' check (payment_timing in ('before_lesson', 'after_lesson')),
  payment_deadline_hours integer default 24,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text check (subscription_status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid')),
  subscription_plan text check (subscription_plan in ('monthly', 'yearly')),
  subscription_current_period_end timestamptz,
  trial_used boolean not null default false,
  trial_ends_at timestamptz,
  company_commission_percent int default 0,
  preferred_locale text check (preferred_locale is null or preferred_locale in ('lt', 'en', 'pl', 'lv', 'ee')),
  accepted_privacy_policy_at timestamptz,
  accepted_terms_at timestamptz,
  created_at timestamp with time zone default timezone('utc', now()) not null
);

create table if not exists public.organization_admins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

create table if not exists public.tutor_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token               text NOT NULL UNIQUE,
  used                boolean NOT NULL DEFAULT false,
  used_by_profile_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  type                text NOT NULL DEFAULT 'code' CHECK (type IN ('code', 'full')),
  subjects_preset     jsonb,
  invitee_name        text,
  invitee_email        text,
  invitee_phone        text,
  cancellation_hours  int DEFAULT 24,
  cancellation_fee_percent int DEFAULT 0,
  reminder_student_hours int DEFAULT 2,
  reminder_tutor_hours int DEFAULT 2,
  break_between_lessons int DEFAULT 0,
  min_booking_hours  int DEFAULT 1,
  company_commission_percent int DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

create table if not exists public.students (
  id uuid default uuid_generate_v4() primary key,
  tutor_id uuid references public.profiles(id) on delete cascade not null,
  full_name text not null,
  email text,
  phone text,
  invite_code text,
  linked_user_id uuid references auth.users on delete set null,
  age integer,
  grade text,
  subject_id uuid,
  payment_payer text default 'self',
  payer_name text,
  payer_email text,
  payer_phone text,
  accepted_privacy_policy_at timestamptz,
  accepted_terms_at timestamptz,
  created_at timestamp with time zone default timezone('utc', now()) not null
);

create table if not exists public.sessions (
  id uuid default uuid_generate_v4() primary key,
  tutor_id uuid references public.profiles(id) on delete cascade not null,
  student_id uuid references public.students(id) on delete cascade not null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone not null,
  status text check (status in ('active', 'cancelled', 'completed', 'no_show')) default 'active',
  paid boolean default false,
  payment_status text default 'pending',
  price decimal(10,2),
  topic text,
  student_notes text,
  meeting_link text,
  cancellation_reason text,
  tutor_comment text,
  show_comment_to_student boolean default false,
  reminder_student_sent boolean default false,
  reminder_tutor_sent boolean default false,
  created_at timestamp with time zone default timezone('utc', now()) not null
);

create table if not exists public.waitlists (
  id uuid default uuid_generate_v4() primary key,
  tutor_id uuid references public.profiles(id) on delete cascade not null,
  student_id uuid references public.students(id) on delete cascade not null,
  session_id uuid references public.sessions(id) on delete set null,
  preferred_day text,
  preferred_time text,
  notes text,
  created_at timestamp with time zone default timezone('utc', now()) not null
);

create table if not exists public.availability (
  id uuid default uuid_generate_v4() primary key,
  tutor_id uuid references public.profiles(id) on delete cascade not null,
  day_of_week integer,
  start_time time not null,
  end_time time not null,
  is_recurring boolean default true,
  specific_date date,
  end_date date,
  created_at timestamp with time zone default timezone('utc', now()) not null
);

create table if not exists public.subjects (
  id uuid default uuid_generate_v4() primary key,
  tutor_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  duration_minutes integer not null default 60,
  price decimal(10,2) not null default 25,
  color text not null default '#6366f1',
  created_at timestamp with time zone default timezone('utc', now()) not null
);

create table if not exists public.payments (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.sessions(id),
  student_id uuid references public.students(id),
  amount decimal(10,2) not null,
  status text default 'pending',
  created_at timestamp with time zone default timezone('utc', now()) not null
);

-- Add missing columns safely
alter table public.profiles add column if not exists phone text;
alter table public.students add column if not exists invite_code text;
alter table public.students add column if not exists linked_user_id uuid references auth.users;
alter table public.students add column if not exists age integer;
alter table public.students add column if not exists grade text;
-- subject_id added after subjects table exists:
alter table public.students add column if not exists subject_id uuid references public.subjects(id) on delete set null;
alter table public.sessions add column if not exists price decimal(10,2);
alter table public.sessions add column if not exists topic text;
alter table public.sessions add column if not exists student_notes text;
alter table public.sessions add column if not exists meeting_link text;
alter table public.sessions add column if not exists subject_id uuid references public.subjects(id) on delete set null;
alter table public.waitlists add column if not exists session_id uuid references public.sessions(id) on delete set null;
alter table public.waitlists add column if not exists notes text;
alter table public.availability add column if not exists end_date date;
alter table public.profiles add column if not exists cancellation_hours integer default 24;
alter table public.profiles add column if not exists cancellation_fee_percent integer default 0;
alter table public.sessions add column if not exists cancellation_reason text;
alter table public.profiles add column if not exists reminder_student_hours numeric default 2;
alter table public.profiles add column if not exists reminder_tutor_hours numeric default 2;
alter table public.profiles alter column reminder_student_hours type numeric using reminder_student_hours::numeric;
alter table public.profiles alter column reminder_tutor_hours type numeric using reminder_tutor_hours::numeric;
alter table public.profiles add column if not exists min_booking_hours integer default 1;
alter table public.profiles add column if not exists daily_digest_enabled boolean default true;

-- Google Calendar integration
alter table public.profiles add column if not exists google_calendar_access_token text;
alter table public.profiles add column if not exists google_calendar_refresh_token text;
alter table public.profiles add column if not exists google_calendar_token_expiry timestamptz;
alter table public.profiles add column if not exists google_calendar_connected boolean default false;
alter table public.profiles add column if not exists google_calendar_sync_enabled boolean default true;

alter table public.sessions add column if not exists payment_status text default 'pending';
alter table public.sessions add column if not exists meeting_link text;
alter table public.sessions add column if not exists google_calendar_event_id text;
alter table public.sessions add column if not exists tutor_comment text;
alter table public.sessions add column if not exists show_comment_to_student boolean default false;
alter table public.sessions add column if not exists no_show_when text
  check (no_show_when is null or no_show_when in ('before_lesson', 'during_lesson', 'after_lesson'));

alter table public.subjects add column if not exists meeting_link text;

alter table public.availability add column if not exists subject_ids uuid[] default '{}';
alter table public.availability add column if not exists google_calendar_event_id text;

-- ─── Row Level Security ────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.sessions enable row level security;
alter table public.waitlists enable row level security;
alter table public.availability enable row level security;
alter table public.subjects enable row level security;
alter table public.payments enable row level security;

-- ─── Policies (drop first, then create – safe to re-run) ──────────────────────

-- profiles
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- students
drop policy if exists "students_select" on public.students;
drop policy if exists "students_insert" on public.students;
drop policy if exists "students_update" on public.students;
drop policy if exists "students_delete" on public.students;
drop policy if exists "students_public_invite" on public.students;
create policy "students_select" on public.students for select using (auth.uid() = tutor_id);
create policy "students_insert" on public.students for insert with check (auth.uid() = tutor_id);
create policy "students_update" on public.students for update using (auth.uid() = tutor_id);
create policy "students_delete" on public.students for delete using (auth.uid() = tutor_id);
create policy "students_public_invite" on public.students for select using (invite_code is not null);

-- sessions
drop policy if exists "sessions_select" on public.sessions;
drop policy if exists "sessions_insert" on public.sessions;
drop policy if exists "sessions_update" on public.sessions;
drop policy if exists "sessions_delete" on public.sessions;
create policy "sessions_select" on public.sessions for select using (
    auth.uid() = tutor_id OR
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
);
create policy "sessions_insert" on public.sessions for insert with check (
    auth.uid() = tutor_id OR
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
);
create policy "sessions_update" on public.sessions for update using (auth.uid() = tutor_id);
create policy "sessions_delete" on public.sessions for delete using (auth.uid() = tutor_id);

-- Allow students to update their own sessions (e.g. cancel)
drop policy if exists "sessions_student_update" on public.sessions;
create policy "sessions_student_update" on public.sessions for update
using (student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid()))
with check (student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid()));

-- waitlists
drop policy if exists "waitlists_all" on public.waitlists;
create policy "waitlists_all" on public.waitlists for all using (
    auth.uid() = tutor_id OR
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
);

-- availability
drop policy if exists "availability_manage" on public.availability;
drop policy if exists "availability_public" on public.availability;
create policy "availability_manage" on public.availability for all using (auth.uid() = tutor_id);
create policy "availability_public" on public.availability for select using (true);

-- subjects
drop policy if exists "subjects_select" on public.subjects;
drop policy if exists "subjects_insert" on public.subjects;
drop policy if exists "subjects_update" on public.subjects;
drop policy if exists "subjects_delete" on public.subjects;
drop policy if exists "subjects_public_read" on public.subjects;
create policy "subjects_select" on public.subjects for select using (auth.uid() = tutor_id);
create policy "subjects_insert" on public.subjects for insert with check (auth.uid() = tutor_id);
create policy "subjects_update" on public.subjects for update using (auth.uid() = tutor_id);
create policy "subjects_delete" on public.subjects for delete using (auth.uid() = tutor_id);
-- Allow anyone to read subjects (needed for onboarding & public booking)
create policy "subjects_public_read" on public.subjects for select using (true);

-- students – allow self-update after account creation
drop policy if exists "students_self_update" on public.students;
create policy "students_self_update" on public.students for update
using (auth.uid() = linked_user_id OR linked_user_id is null)
with check (auth.uid() = linked_user_id);
drop policy if exists "students_self_select" on public.students;
create policy "students_self_select" on public.students for select using (auth.uid() = linked_user_id);

-- payments
drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments for select using (
  auth.uid() in (select tutor_id from public.sessions where id = session_id)
);

-- ─── Trigger: auto-create profile on signup ────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger as $$
declare
  meta_role text := lower(trim(coalesce(new.raw_user_meta_data->>'role', '')));
  meta_student_id text := trim(coalesce(new.raw_user_meta_data->>'student_id', ''));
  is_student_by_meta boolean := (meta_role = 'student' or meta_student_id <> '');
  student_id_to_link uuid;
  linked_count int;
begin
  -- 1) Explicit student signup (metadata present)
  if is_student_by_meta and meta_student_id <> '' then
    update public.students
    set
      linked_user_id = new.id,
      email = coalesce(new.email, new.raw_user_meta_data->>'email'),
      phone = coalesce(new.raw_user_meta_data->>'phone', phone),
      age = cast(nullif(new.raw_user_meta_data->>'age', '') as integer),
      grade = new.raw_user_meta_data->>'grade',
      subject_id = nullif(new.raw_user_meta_data->>'subject_id', '')::uuid,
      payment_payer = coalesce(new.raw_user_meta_data->>'payment_payer', 'self'),
      payer_name = new.raw_user_meta_data->>'payer_name',
      payer_email = new.raw_user_meta_data->>'payer_email',
      payer_phone = new.raw_user_meta_data->>'payer_phone',
      accepted_privacy_policy_at = (new.raw_user_meta_data->>'accepted_privacy_policy_at')::timestamptz,
      accepted_terms_at = (new.raw_user_meta_data->>'accepted_terms_at')::timestamptz
    where id = meta_student_id::uuid;
    return new;
  end if;

  -- 2) Fallback: metadata lost (e.g. after email confirm) – student with this email and no linked_user_id?
  select s.id into student_id_to_link
  from public.students s
  where s.linked_user_id is null
    and trim(lower(coalesce(s.email, ''))) = trim(lower(coalesce(new.email, '')))
  limit 1;

  if student_id_to_link is not null then
    update public.students
    set linked_user_id = new.id, email = coalesce(new.email, email)
    where id = student_id_to_link;
    get diagnostics linked_count = row_count;
    if linked_count > 0 then
      return new;
    end if;
  end if;

  -- 3) Tutor signup: create profile
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================
-- Migration: 20260102000001_organizations.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL,
  tutor_limit   int  NOT NULL DEFAULT 5,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_admins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS tutor_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token               text NOT NULL UNIQUE,
  used                boolean NOT NULL DEFAULT false,
  used_by_profile_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recurring_individual_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id    uuid REFERENCES subjects(id) ON DELETE SET NULL,
  day_of_week   int  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  start_date    date NOT NULL,
  end_date      date,
  meeting_link  text,
  topic         text,
  price         numeric(10,2),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS recurring_session_id uuid REFERENCES recurring_individual_sessions(id) ON DELETE SET NULL;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS cancelled_by text CHECK (cancelled_by IN ('tutor', 'student'));

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admin can read own org" ON organizations;
CREATE POLICY "Org admin can read own org" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
    )
  );

ALTER TABLE organization_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admin reads own row" ON organization_admins;
CREATE POLICY "Org admin reads own row" ON organization_admins
  FOR SELECT USING (user_id = auth.uid());

ALTER TABLE tutor_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admin manages invites" ON tutor_invites;
CREATE POLICY "Org admin manages invites" ON tutor_invites
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Anyone can read invite by token" ON tutor_invites;
CREATE POLICY "Anyone can read invite by token" ON tutor_invites
  FOR SELECT USING (true);

ALTER TABLE recurring_individual_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tutor manages own recurring sessions" ON recurring_individual_sessions;
CREATE POLICY "Tutor manages own recurring sessions" ON recurring_individual_sessions
  FOR ALL USING (tutor_id = auth.uid());

DROP POLICY IF EXISTS "Org admin sees org tutors recurring sessions" ON recurring_individual_sessions;
CREATE POLICY "Org admin sees org tutors recurring sessions" ON recurring_individual_sessions
  FOR ALL USING (
    tutor_id IN (
      SELECT id FROM profiles
      WHERE organization_id IN (
        SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
      )
    )
  );

GRANT ALL ON organizations                  TO service_role, authenticated, anon;
GRANT ALL ON organization_admins            TO service_role, authenticated, anon;
GRANT ALL ON tutor_invites                  TO service_role, authenticated, anon;
GRANT ALL ON recurring_individual_sessions  TO service_role, authenticated, anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role, authenticated, anon;

-- =====================================================
-- Migration: 20260102000002_invite_updates.sql
-- =====================================================

ALTER TABLE tutor_invites
  ADD COLUMN IF NOT EXISTS type           text NOT NULL DEFAULT 'code' CHECK (type IN ('code', 'full')),
  ADD COLUMN IF NOT EXISTS subjects_preset jsonb,
  ADD COLUMN IF NOT EXISTS invitee_name   text,
  ADD COLUMN IF NOT EXISTS invitee_email  text;

GRANT ALL ON tutor_invites TO service_role, authenticated, anon;

-- =====================================================
-- Migration: 20260102000003_tutor_invite_rls.sql
-- =====================================================
-- (Moved to later migration - see line ~472)

-- =====================================================
-- Migration: 20260102000004_profiles_rls_fix.sql
-- =====================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'profiles' AND policyname = 'Public profiles are viewable by everyone.'
    ) THEN
        CREATE POLICY "Public profiles are viewable by everyone."
        ON profiles FOR SELECT USING (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'profiles' AND policyname = 'Users can insert their own profile.'
    ) THEN
        CREATE POLICY "Users can insert their own profile."
        ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'profiles' AND policyname = 'Users can update own profile.'
    ) THEN
        CREATE POLICY "Users can update own profile."
        ON profiles FOR UPDATE USING (auth.uid() = id);
    END IF;
END $$;

GRANT ALL ON profiles TO authenticated, anon, service_role;

-- =====================================================
-- Migration: 20260102000005_tutor_invites_usable.sql
-- =====================================================

DROP POLICY IF EXISTS "Tutor can mark own invite used" ON tutor_invites;

CREATE POLICY "Tutor can mark own invite used" ON tutor_invites
  FOR UPDATE
  USING (
    NOT used
  )
  WITH CHECK (
    used = true AND
    used_by_profile_id = auth.uid()
  );

-- =====================================================
-- Migration: 20260102000006_org_tutor_permissions.sql
-- =====================================================

DROP POLICY IF EXISTS "Tutors can read their own org" ON organizations;
CREATE POLICY "Tutors can read their own org" ON organizations
  FOR SELECT USING (
    id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Org admins can update their org's tutors" ON profiles;
CREATE POLICY "Org admins can update their org's tutors" ON profiles
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- Migration: 20260102000007_invite_defaults.sql
-- =====================================================

ALTER TABLE tutor_invites
  ADD COLUMN IF NOT EXISTS cancellation_hours int DEFAULT 24,
  ADD COLUMN IF NOT EXISTS cancellation_fee_percent int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reminder_student_hours int DEFAULT 2,
  ADD COLUMN IF NOT EXISTS reminder_tutor_hours int DEFAULT 2,
  ADD COLUMN IF NOT EXISTS break_between_lessons int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_booking_hours int DEFAULT 1;

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tutor subject insert" ON subjects;

CREATE POLICY "Tutor subject insert" ON subjects
  FOR INSERT WITH CHECK (tutor_id = auth.uid());

DROP POLICY IF EXISTS "Tutor subjects CRUD" ON subjects;

CREATE POLICY "Tutor subjects CRUD" ON subjects
  FOR ALL USING (tutor_id = auth.uid());

DROP POLICY IF EXISTS "Org admins see org subjects" ON subjects;

CREATE POLICY "Org admins see org subjects" ON subjects
  FOR ALL USING (
    tutor_id IN (
      SELECT id FROM profiles
      WHERE organization_id IN (
        SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
      )
    )
  );

GRANT ALL ON subjects TO service_role, authenticated, anon;

-- =====================================================
-- Migration: 20260102000008_company_commission.sql
-- =====================================================

ALTER TABLE tutor_invites
  ADD COLUMN IF NOT EXISTS company_commission_percent int DEFAULT 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS company_commission_percent int DEFAULT 0;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_cancellation_hours int DEFAULT 24,
  ADD COLUMN IF NOT EXISTS default_cancellation_fee_percent int DEFAULT 50,
  ADD COLUMN IF NOT EXISTS default_reminder_student_hours int DEFAULT 24,
  ADD COLUMN IF NOT EXISTS default_reminder_tutor_hours int DEFAULT 24,
  ADD COLUMN IF NOT EXISTS default_break_between_lessons int DEFAULT 15,
  ADD COLUMN IF NOT EXISTS default_min_booking_hours int DEFAULT 24,
  ADD COLUMN IF NOT EXISTS default_company_commission_percent int DEFAULT 0;

-- =====================================================
-- Migration: 20260102000009_organizations_update_policy.sql
-- =====================================================

DROP POLICY IF EXISTS "Org admin can update own org" ON organizations;
CREATE POLICY "Org admin can update own org" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- Migration: 20260102000010_profiles_missing_columns.sql
-- =====================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cancellation_hours int DEFAULT 24,
  ADD COLUMN IF NOT EXISTS cancellation_fee_percent int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reminder_student_hours int DEFAULT 2,
  ADD COLUMN IF NOT EXISTS reminder_tutor_hours int DEFAULT 2,
  ADD COLUMN IF NOT EXISTS break_between_lessons int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_booking_hours int DEFAULT 1;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS daily_digest_enabled boolean DEFAULT true;

-- =====================================================
-- Migration: 20260102000011_students_org_admin_policy.sql
-- =====================================================

DROP POLICY IF EXISTS "Org admin can view org students" ON students;
DROP POLICY IF EXISTS "Org admin can insert org students" ON students;
DROP POLICY IF EXISTS "Org admin can update org students" ON students;
DROP POLICY IF EXISTS "Org admin can delete org students" ON students;

CREATE POLICY "Org admin can view org students" ON students
  FOR SELECT USING (
    tutor_id IN (
      SELECT id FROM profiles
      WHERE organization_id IN (
        SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Org admin can insert org students" ON students
  FOR INSERT WITH CHECK (
    tutor_id IN (
      SELECT id FROM profiles
      WHERE organization_id IN (
        SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Org admin can update org students" ON students
  FOR UPDATE USING (
    tutor_id IN (
      SELECT id FROM profiles
      WHERE organization_id IN (
        SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Org admin can delete org students" ON students
  FOR DELETE USING (
    tutor_id IN (
      SELECT id FROM profiles
      WHERE organization_id IN (
        SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
      )
    )
  );

-- =====================================================
-- Migration: 20260103000001_rls_security_hardening.sql
-- =====================================================

DROP POLICY IF EXISTS "students_self_update" ON students;

CREATE POLICY "students_self_update" ON students
  FOR UPDATE
  USING  (auth.uid() = linked_user_id)
  WITH CHECK (auth.uid() = linked_user_id);

DROP POLICY IF EXISTS "Org admins can view org sessions" ON sessions;

CREATE POLICY "Org admins can view org sessions" ON sessions
  FOR SELECT USING (
    tutor_id IN (
      SELECT id FROM profiles
      WHERE organization_id IN (
        SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Org admins see org subjects" ON subjects;

CREATE POLICY "Org admins see org subjects" ON subjects
  FOR SELECT USING (
    tutor_id IN (
      SELECT id FROM profiles
      WHERE organization_id IN (
        SELECT organization_id FROM organization_admins WHERE user_id = auth.uid()
      )
    )
  );

-- =====================================================
-- Migration: 20260103000002_student_invite_function.sql
-- =====================================================
-- Drop first so return type can change if needed (CREATE OR REPLACE cannot change return type)
DROP FUNCTION IF EXISTS public.get_student_by_invite_code(text);

CREATE OR REPLACE FUNCTION public.get_student_by_invite_code(p_invite_code text)
RETURNS TABLE (
  id            uuid,
  full_name     text,
  email         text,
  phone         text,
  tutor_id      uuid,
  linked_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.full_name,
    s.email,
    s.phone,
    s.tutor_id,
    s.linked_user_id
  FROM public.students s
  WHERE s.invite_code = p_invite_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_by_invite_code(text) TO anon, authenticated;

-- =====================================================
-- Student RPCs: by user_id, by email for linking, full info (Login / student pages)
-- =====================================================
DROP FUNCTION IF EXISTS public.get_student_by_user_id(uuid);
CREATE OR REPLACE FUNCTION public.get_student_by_user_id(p_user_id uuid)
RETURNS TABLE (
  id            uuid,
  full_name     text,
  email         text,
  phone         text,
  tutor_id      uuid,
  linked_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.full_name, s.email, s.phone, s.tutor_id, s.linked_user_id
  FROM public.students s
  WHERE s.linked_user_id = p_user_id
  LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_student_by_user_id(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_student_by_email_for_linking(text);
CREATE OR REPLACE FUNCTION public.get_student_by_email_for_linking(p_email text)
RETURNS TABLE (id uuid, linked_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.linked_user_id
  FROM public.students s
  WHERE trim(lower(coalesce(s.email, ''))) = trim(lower(coalesce(p_email, '')))
    AND (s.linked_user_id = auth.uid() OR s.linked_user_id IS NULL)
  LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_student_by_email_for_linking(text) TO authenticated;

DROP FUNCTION IF EXISTS public.get_student_full_info(uuid);
CREATE OR REPLACE FUNCTION public.get_student_full_info(p_user_id uuid)
RETURNS TABLE (
  id              uuid,
  full_name       text,
  email           text,
  phone           text,
  age             integer,
  grade           text,
  tutor_id        uuid,
  tutor_full_name text,
  tutor_email     text,
  payment_payer   text,
  invite_code     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.full_name,
    s.email,
    s.phone,
    s.age,
    s.grade,
    s.tutor_id,
    p.full_name AS tutor_full_name,
    p.email     AS tutor_email,
    s.payment_payer,
    s.invite_code
  FROM public.students s
  LEFT JOIN public.profiles p ON p.id = s.tutor_id
  WHERE s.linked_user_id = p_user_id
  LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_student_full_info(uuid) TO authenticated;

-- =====================================================
-- Migration: 20260103000003_storage_rls.sql
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'session-files',
  'session-files',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Tutor manages session files" ON storage.objects;
CREATE POLICY "Tutor manages session files" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'session-files'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'session-files'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.tutor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Student downloads session files" ON storage.objects;
CREATE POLICY "Student downloads session files" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'session-files'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.students st ON st.id = s.student_id
      WHERE s.id::text = split_part(name, '/', 1)
        AND st.linked_user_id = auth.uid()
    )
  );

-- =====================================================
-- Migration: 20260310000001_student_reschedule_function.sql
-- =====================================================

DROP FUNCTION IF EXISTS student_reschedule_session(uuid, timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION student_reschedule_session(
  p_session_id uuid,
  p_new_start_time timestamptz,
  p_new_end_time timestamptz
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_session_student_id uuid;
BEGIN
  SELECT id INTO v_student_id
  FROM students
  WHERE linked_user_id = auth.uid()
  LIMIT 1;

  IF v_student_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Student not found');
  END IF;

  SELECT student_id INTO v_session_student_id
  FROM sessions
  WHERE id = p_session_id;

  IF v_session_student_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF v_session_student_id != v_student_id THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized to reschedule this session');
  END IF;

  UPDATE sessions
  SET
    start_time = p_new_start_time,
    end_time = p_new_end_time,
    reminder_student_sent = false,
    reminder_tutor_sent = false,
    reminder_payer_sent = false
  WHERE id = p_session_id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION student_reschedule_session(uuid, timestamptz, timestamptz) TO authenticated;

-- =====================================================
-- Migration: 20260310150000_subject_grade_pricing.sql
-- =====================================================

ALTER TABLE subjects ADD COLUMN IF NOT EXISTS grade_min int CHECK (grade_min IS NULL OR (grade_min >= 1 AND grade_min <= 20));
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS grade_max int CHECK (grade_max IS NULL OR (grade_max >= 1 AND grade_max <= 20));

ALTER TABLE subjects ADD CONSTRAINT check_grade_range
  CHECK (
    (grade_min IS NULL AND grade_max IS NULL) OR
    (grade_min IS NOT NULL AND grade_max IS NOT NULL AND grade_max >= grade_min)
  );

COMMENT ON COLUMN subjects.grade_min IS 'Minimum grade for this subject pricing (1-12 for school grades, NULL for all grades)';
COMMENT ON COLUMN subjects.grade_max IS 'Maximum grade for this subject pricing (1-12 for school grades, NULL for all grades)';

-- =====================================================
-- Migration: 20260310160000_update_min_booking_hours_default.sql
-- =====================================================

ALTER TABLE profiles ALTER COLUMN min_booking_hours SET DEFAULT 24;

UPDATE profiles
SET min_booking_hours = 24
WHERE min_booking_hours = 1;

-- =====================================================
-- Migration: 20260310170000_student_individual_pricing.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS student_individual_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  duration_minutes int NOT NULL CHECK (duration_minutes > 0),
  cancellation_hours int NOT NULL DEFAULT 24,
  cancellation_fee_percent int NOT NULL DEFAULT 0 CHECK (cancellation_fee_percent >= 0 AND cancellation_fee_percent <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(student_id, subject_id)
);

ALTER TABLE student_individual_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tutors can view own student pricing" ON student_individual_pricing;
DROP POLICY IF EXISTS "Tutors can insert own student pricing" ON student_individual_pricing;
DROP POLICY IF EXISTS "Tutors can update own student pricing" ON student_individual_pricing;
DROP POLICY IF EXISTS "Tutors can delete own student pricing" ON student_individual_pricing;
DROP POLICY IF EXISTS "Students can view own pricing" ON student_individual_pricing;

CREATE POLICY "Tutors can view own student pricing"
  ON student_individual_pricing FOR SELECT
  USING (tutor_id = auth.uid());

CREATE POLICY "Tutors can insert own student pricing"
  ON student_individual_pricing FOR INSERT
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "Tutors can update own student pricing"
  ON student_individual_pricing FOR UPDATE
  USING (tutor_id = auth.uid());

CREATE POLICY "Tutors can delete own student pricing"
  ON student_individual_pricing FOR DELETE
  USING (tutor_id = auth.uid());

CREATE POLICY "Students can view own pricing"
  ON student_individual_pricing FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM students WHERE id = (
        SELECT id FROM students WHERE invite_code = current_setting('request.jwt.claims', true)::json->>'invite_code'
      )
    )
  );

CREATE INDEX idx_student_individual_pricing_student_id ON student_individual_pricing(student_id);
CREATE INDEX idx_student_individual_pricing_tutor_id ON student_individual_pricing(tutor_id);
CREATE INDEX idx_student_individual_pricing_subject_id ON student_individual_pricing(subject_id);

COMMENT ON TABLE student_individual_pricing IS 'Custom pricing for individual students (per subject)';
COMMENT ON COLUMN student_individual_pricing.price IS 'Individual price in EUR for this student for this subject';
COMMENT ON COLUMN student_individual_pricing.duration_minutes IS 'Individual lesson duration for this student for this subject';
COMMENT ON COLUMN student_individual_pricing.cancellation_hours IS 'Individual cancellation deadline hours for this student';
COMMENT ON COLUMN student_individual_pricing.cancellation_fee_percent IS 'Individual cancellation fee % for this student';

-- =====================================================
-- Migration: 20260310180000_fix_individual_pricing_rls.sql
-- =====================================================

ALTER TABLE student_individual_pricing ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Tutors can view own student pricing" ON student_individual_pricing;
    DROP POLICY IF EXISTS "Tutors can insert own student pricing" ON student_individual_pricing;
    DROP POLICY IF EXISTS "Tutors can update own student pricing" ON student_individual_pricing;
    DROP POLICY IF EXISTS "Tutors can delete own student pricing" ON student_individual_pricing;
    DROP POLICY IF EXISTS "Students can view own pricing" ON student_individual_pricing;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Tutors can view own student pricing"
  ON student_individual_pricing FOR SELECT
  USING (tutor_id = auth.uid());

CREATE POLICY "Tutors can insert own student pricing"
  ON student_individual_pricing FOR INSERT
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "Tutors can update own student pricing"
  ON student_individual_pricing FOR UPDATE
  USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY "Tutors can delete own student pricing"
  ON student_individual_pricing FOR DELETE
  USING (tutor_id = auth.uid());

CREATE POLICY "Students can view own pricing"
  ON student_individual_pricing FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM students
      WHERE invite_code = current_setting('request.jwt.claims', true)::json->>'invite_code'
    )
  );

-- =====================================================
-- Migration: 20260310183000_grant_permissions_individual_pricing.sql
-- =====================================================

GRANT ALL ON TABLE student_individual_pricing TO authenticated, service_role;

-- =====================================================
-- Migration: 20260310190000_storage_session_files.sql
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'session-files',
  'session-files',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Tutor manages session files" ON storage.objects;
CREATE POLICY "Tutor manages session files" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'session-files'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'session-files'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id::text = split_part(name, '/', 1)
        AND s.tutor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Student downloads session files" ON storage.objects;
CREATE POLICY "Student downloads session files" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'session-files'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      JOIN public.students st ON st.id = s.student_id
      WHERE s.id::text = split_part(name, '/', 1)
        AND st.linked_user_id = auth.uid()
    )
  );

-- =====================================================
-- Migration: 20260310213000_rpc_get_student_individual_pricing.sql
-- =====================================================
DROP FUNCTION IF EXISTS get_student_individual_pricing(uuid);

CREATE OR REPLACE FUNCTION get_student_individual_pricing(p_student_id UUID)
RETURNS TABLE (
    id UUID,
    student_id UUID,
    tutor_id UUID,
    subject_id UUID,
    price NUMERIC,
    duration_minutes INTEGER,
    cancellation_hours INTEGER,
    cancellation_fee_percent NUMERIC,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT
        id,
        student_id,
        tutor_id,
        subject_id,
        price,
        duration_minutes,
        cancellation_hours,
        cancellation_fee_percent,
        created_at
    FROM public.student_individual_pricing
    WHERE student_id = p_student_id;
$$;

-- =====================================================
-- Migration: 20260310220000_payment_deadline_warning.sql
-- =====================================================

-- Add column to track if a 30-min payment deadline warning has been sent to the tutor.
-- Null = not sent, true = sent (prevents duplicate emails from the cron job).
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS payment_deadline_warning_sent boolean;

-- =====================================================
-- Migration: 20260310230000_students_payer_fields.sql
-- =====================================================

-- Payer info: who pays for the student's lessons (self or parents).
-- These fields are saved during student onboarding when payerType = 'parent'.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS payment_payer text DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS payer_name text,
  ADD COLUMN IF NOT EXISTS payer_email text,
  ADD COLUMN IF NOT EXISTS payer_phone text;

-- =====================================================
-- Migration: payment_timing on profiles (for Finance page)
-- =====================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payment_timing text DEFAULT 'before_lesson' CHECK (payment_timing IN ('before_lesson', 'after_lesson')),
  ADD COLUMN IF NOT EXISTS payment_deadline_hours integer DEFAULT 24;

-- For sessions: track if "pay after lesson" reminder was sent to payer
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS payment_after_lesson_reminder_sent boolean;

-- For sessions: track if "session approaching" reminder was sent to payer (parent)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS reminder_payer_sent boolean;

-- Store Stripe Checkout session id on sessions (payment confirmation / reconciliation)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

-- =====================================================
-- Migration: 20260313000001_tutor_subscriptions.sql
-- =====================================================

-- Add subscription columns to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid')),
  ADD COLUMN IF NOT EXISTS subscription_plan text CHECK (subscription_plan IN ('monthly', 'yearly')),
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz;

-- Create index for faster subscription lookups
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON public.profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON public.profiles(stripe_customer_id);

COMMENT ON COLUMN public.profiles.stripe_customer_id IS 'Stripe customer ID for subscription billing';
COMMENT ON COLUMN public.profiles.stripe_subscription_id IS 'Stripe subscription ID';
COMMENT ON COLUMN public.profiles.subscription_status IS 'Current subscription status (active, trialing, canceled, etc.)';
COMMENT ON COLUMN public.profiles.subscription_plan IS 'Subscription plan type (monthly or yearly)';
COMMENT ON COLUMN public.profiles.subscription_current_period_end IS 'When the current subscription period ends';

-- =====================================================
-- Migration: 20260313000002_profiles_trial_used.sql
-- =====================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_used boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.trial_used IS 'True if this account has already used the 7-day free trial (one per account).';

-- =====================================================
-- Migration: consent_privacy_terms (privacy policy & terms acceptance)
-- =====================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accepted_privacy_policy_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz;
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS accepted_privacy_policy_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz;

-- =====================================================
-- Stripe Connect (optional: payouts to tutors / orgs)
-- =====================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete boolean DEFAULT false;
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete boolean DEFAULT false;

-- ============================================================
-- Migration: 20260318000001_monthly_payment_system.sql
-- Monthly Payment System - Adds support for:
-- 1. Prepaid lesson packages (student pays for X lessons upfront)
-- 2. Monthly billing (tutor sends invoices for completed lessons)
-- ============================================================

-- ─── 1. LESSON PACKAGES TABLE ───────────────────────────────────────────
-- Tracks prepaid lesson packages purchased by students
CREATE TABLE IF NOT EXISTS public.lesson_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,

  -- Lesson counts (numeric to support fractional penalty credits)
  total_lessons INT NOT NULL CHECK (total_lessons > 0),
  available_lessons NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (available_lessons >= 0),
  reserved_lessons NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (reserved_lessons >= 0),
  completed_lessons NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (completed_lessons >= 0),

  -- Pricing
  price_per_lesson NUMERIC(10,2) NOT NULL CHECK (price_per_lesson >= 0),
  total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),

  -- Payment status
  paid BOOLEAN NOT NULL DEFAULT false,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  stripe_checkout_session_id TEXT,

  -- Status
  active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- Optional: for future expiry feature

  -- Constraints
  CONSTRAINT lesson_counts_valid CHECK (
    available_lessons + reserved_lessons + completed_lessons <= total_lessons
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lesson_packages_tutor ON public.lesson_packages(tutor_id);
CREATE INDEX IF NOT EXISTS idx_lesson_packages_student ON public.lesson_packages(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_packages_subject ON public.lesson_packages(subject_id);
CREATE INDEX IF NOT EXISTS idx_lesson_packages_active ON public.lesson_packages(tutor_id, student_id, active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_lesson_packages_stripe ON public.lesson_packages(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;

-- ─── 2. BILLING BATCHES TABLE ───────────────────────────────────────────
-- Tracks monthly invoices sent by tutors for completed lessons
CREATE TABLE IF NOT EXISTS public.billing_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Period covered by this invoice
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,

  -- Payment deadline
  payment_deadline_days INT NOT NULL CHECK (payment_deadline_days > 0),
  payment_deadline_date TIMESTAMPTZ NOT NULL,

  -- Total amount
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),

  -- Payment status
  paid BOOLEAN NOT NULL DEFAULT false,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled')),
  stripe_checkout_session_id TEXT,

  -- Payer info (from first session in batch)
  payer_email TEXT NOT NULL,
  payer_name TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT period_dates_valid CHECK (period_end_date >= period_start_date),
  CONSTRAINT period_max_45_days CHECK (period_end_date - period_start_date <= 45)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_billing_batches_tutor ON public.billing_batches(tutor_id);
CREATE INDEX IF NOT EXISTS idx_billing_batches_payer ON public.billing_batches(payer_email);
CREATE INDEX IF NOT EXISTS idx_billing_batches_stripe ON public.billing_batches(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_batches_unpaid ON public.billing_batches(tutor_id, paid) WHERE paid = false;

-- ─── 3. BILLING BATCH SESSIONS JUNCTION TABLE ──────────────────────────
-- Links sessions to billing batches
CREATE TABLE IF NOT EXISTS public.billing_batch_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_batch_id UUID NOT NULL REFERENCES public.billing_batches(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,

  -- Store session details at time of billing (in case session is later modified)
  session_date TIMESTAMPTZ NOT NULL,
  session_price NUMERIC(10,2) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicate sessions in batches
  UNIQUE(session_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_billing_batch_sessions_batch ON public.billing_batch_sessions(billing_batch_id);
CREATE INDEX IF NOT EXISTS idx_billing_batch_sessions_session ON public.billing_batch_sessions(session_id);

-- ─── 4. ADD COLUMNS TO SESSIONS TABLE ──────────────────────────────────
-- Link sessions to lesson packages or billing batches
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS lesson_package_id UUID REFERENCES public.lesson_packages(id) ON DELETE SET NULL;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS payment_batch_id UUID REFERENCES public.billing_batches(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_lesson_package ON public.sessions(lesson_package_id) WHERE lesson_package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_payment_batch ON public.sessions(payment_batch_id) WHERE payment_batch_id IS NOT NULL;

-- ─── 5. ADD PAYMENT MODEL TO STUDENTS TABLE ────────────────────────────
-- Allow per-student override of payment model
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS payment_model TEXT CHECK (payment_model IN ('per_lesson', 'monthly_billing', 'prepaid_packages'));

COMMENT ON COLUMN public.students.payment_model IS 'Override tutor default payment model for this student. NULL = use tutor default.';

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS per_lesson_payment_timing text
    CHECK (per_lesson_payment_timing IS NULL OR per_lesson_payment_timing IN ('before_lesson', 'after_lesson'));

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS per_lesson_payment_deadline_hours integer
    CHECK (per_lesson_payment_deadline_hours IS NULL OR per_lesson_payment_deadline_hours >= 1);

COMMENT ON COLUMN public.students.per_lesson_payment_timing IS
  'When payment_model = per_lesson: overrides tutor/org payment_timing; NULL = inherit.';
COMMENT ON COLUMN public.students.per_lesson_payment_deadline_hours IS
  'When payment_model = per_lesson: overrides payment_deadline_hours; NULL = inherit.';

-- ─── 6. ADD PAYMENT MODEL FLAGS TO PROFILES TABLE ──────────────────────
-- Global settings for tutor''s payment models
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_per_lesson BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_monthly_billing BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_prepaid_packages BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_per_student_payment_override BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.enable_per_lesson IS 'Allow per-lesson payments (before/after lesson)';
COMMENT ON COLUMN public.profiles.enable_monthly_billing IS 'Allow sending monthly invoices for completed lessons';
COMMENT ON COLUMN public.profiles.enable_prepaid_packages IS 'Allow students to buy prepaid lesson packages';

COMMENT ON COLUMN public.profiles.enable_per_student_payment_override IS 'Solo tutor: allow per-student payment_model; orgs use organizations.features.per_student_payment_override';

-- ─── 7. ADD PAYMENT MODEL TO ORGANIZATIONS TABLE ───────────────────────
-- Organization defaults for payment models
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS enable_per_lesson BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS enable_monthly_billing BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS enable_prepaid_packages BOOLEAN NOT NULL DEFAULT false;

-- ─── 8. ROW LEVEL SECURITY (RLS) ───────────────────────────────────────

-- Enable RLS on new tables
ALTER TABLE public.lesson_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_batch_sessions ENABLE ROW LEVEL SECURITY;

-- lesson_packages policies
DROP POLICY IF EXISTS "lesson_packages_tutor_all" ON public.lesson_packages;
CREATE POLICY "lesson_packages_tutor_all" ON public.lesson_packages
  FOR ALL USING (auth.uid() = tutor_id);

DROP POLICY IF EXISTS "lesson_packages_student_select" ON public.lesson_packages;
CREATE POLICY "lesson_packages_student_select" ON public.lesson_packages
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "lesson_packages_org_admin_all" ON public.lesson_packages;
CREATE POLICY "lesson_packages_org_admin_all" ON public.lesson_packages
  FOR ALL USING (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
  );

-- billing_batches policies
DROP POLICY IF EXISTS "billing_batches_tutor_all" ON public.billing_batches;
CREATE POLICY "billing_batches_tutor_all" ON public.billing_batches
  FOR ALL USING (auth.uid() = tutor_id);

DROP POLICY IF EXISTS "billing_batches_org_admin_all" ON public.billing_batches;
CREATE POLICY "billing_batches_org_admin_all" ON public.billing_batches
  FOR ALL USING (
    tutor_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
  );

-- billing_batch_sessions policies (inherit from billing_batches)
DROP POLICY IF EXISTS "billing_batch_sessions_via_batch" ON public.billing_batch_sessions;
CREATE POLICY "billing_batch_sessions_via_batch" ON public.billing_batch_sessions
  FOR ALL USING (
    billing_batch_id IN (
      SELECT id FROM public.billing_batches
      WHERE auth.uid() = tutor_id
    )
  );

DROP POLICY IF EXISTS "billing_batch_sessions_org_admin" ON public.billing_batch_sessions;
CREATE POLICY "billing_batch_sessions_org_admin" ON public.billing_batch_sessions
  FOR ALL USING (
    billing_batch_id IN (
      SELECT bb.id FROM public.billing_batches bb
      INNER JOIN public.profiles p ON p.id = bb.tutor_id
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
    )
  );

-- ─── 9. HELPER FUNCTIONS ────────────────────────────────────────────────

-- Function to get active lesson packages for a student
DROP FUNCTION IF EXISTS get_student_active_packages(UUID);
CREATE OR REPLACE FUNCTION get_student_active_packages(p_student_id UUID)
RETURNS TABLE (
  package_id UUID,
  subject_id UUID,
  subject_name TEXT,
  total_lessons INT,
  available_lessons NUMERIC,
  reserved_lessons NUMERIC,
  completed_lessons NUMERIC,
  price_per_lesson NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lp.id,
    lp.subject_id,
    s.name,
    lp.total_lessons,
    lp.available_lessons,
    lp.reserved_lessons,
    lp.completed_lessons,
    lp.price_per_lesson
  FROM public.lesson_packages lp
  INNER JOIN public.subjects s ON s.id = lp.subject_id
  WHERE lp.student_id = p_student_id
    AND lp.active = true
    AND lp.paid = true
    AND lp.available_lessons > 0
  ORDER BY lp.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unpaid sessions for billing (max 45 days range)
CREATE OR REPLACE FUNCTION get_unpaid_sessions_for_billing(
  p_tutor_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS TABLE (
  session_id UUID,
  student_id UUID,
  student_name TEXT,
  payer_email TEXT,
  payer_name TEXT,
  session_date TIMESTAMPTZ,
  subject_name TEXT,
  price NUMERIC,
  total_count BIGINT
) AS $$
BEGIN
  -- Validate date range
  IF p_period_end - p_period_start > 45 THEN
    RAISE EXCEPTION 'Period cannot exceed 45 days';
  END IF;

  RETURN QUERY
  SELECT
    sess.id,
    sess.student_id,
    st.full_name,
    COALESCE(st.payer_email, st.email) AS payer_email,
    COALESCE(st.payer_name, st.full_name) AS payer_name,
    sess.start_time,
    subj.name,
    CASE
      WHEN sess.status = 'cancelled' AND sess.is_late_cancelled = true
        THEN COALESCE(sess.cancellation_penalty_amount, 0)
      ELSE sess.price
    END AS price,
    COUNT(*) OVER() AS total_count
  FROM public.sessions sess
  INNER JOIN public.students st ON st.id = sess.student_id
  LEFT JOIN public.subjects subj ON subj.id = sess.subject_id
  WHERE sess.tutor_id = p_tutor_id
    AND (
      sess.status = 'completed'
      OR (sess.status = 'cancelled' AND sess.is_late_cancelled = true AND sess.penalty_resolution = 'invoiced')
    )
    AND sess.paid = false
    AND sess.payment_batch_id IS NULL
    AND sess.lesson_package_id IS NULL
    AND DATE(sess.start_time) >= p_period_start
    AND DATE(sess.start_time) <= p_period_end
  ORDER BY sess.start_time ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 10. COMMENTS FOR DOCUMENTATION ────────────────────────────────────
COMMENT ON TABLE public.lesson_packages IS 'Prepaid lesson packages - students pay upfront for X lessons of a subject';
COMMENT ON TABLE public.billing_batches IS 'Monthly invoices sent by tutors for completed lessons in a period';
COMMENT ON TABLE public.billing_batch_sessions IS 'Junction table linking sessions to billing batches';

COMMENT ON COLUMN public.lesson_packages.available_lessons IS 'Lessons that can still be booked (not yet reserved)';
COMMENT ON COLUMN public.lesson_packages.reserved_lessons IS 'Lessons that are booked but not yet completed';
COMMENT ON COLUMN public.lesson_packages.completed_lessons IS 'Lessons that have been completed';

COMMENT ON COLUMN public.sessions.lesson_package_id IS 'If paid via prepaid package, reference to that package';
COMMENT ON COLUMN public.sessions.payment_batch_id IS 'If included in monthly invoice, reference to that batch';

-- =====================================================
-- Migration: 20260407100000_cancellation_penalties.sql
-- Late cancellation penalty system
-- =====================================================

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS is_late_cancelled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_fee_percent_applied int,
  ADD COLUMN IF NOT EXISTS cancellation_penalty_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS penalty_resolution text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_penalty_resolution_check'
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_penalty_resolution_check
      CHECK (penalty_resolution IS NULL OR penalty_resolution IN (
        'pending', 'credit_applied', 'refunded', 'invoiced', 'paid'
      ));
  END IF;
END $$;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS credit_applied_amount numeric(10,2) DEFAULT 0;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS credit_balance numeric(10,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sessions_late_cancelled
  ON public.sessions(is_late_cancelled) WHERE is_late_cancelled = true;
CREATE INDEX IF NOT EXISTS idx_sessions_penalty_resolution
  ON public.sessions(penalty_resolution) WHERE penalty_resolution IS NOT NULL;

COMMENT ON COLUMN public.sessions.is_late_cancelled IS 'True if session was cancelled after the cancellation deadline';
COMMENT ON COLUMN public.sessions.cancellation_fee_percent_applied IS 'The fee % that was applied at cancellation time';
COMMENT ON COLUMN public.sessions.cancellation_penalty_amount IS 'Calculated penalty in EUR (price * fee_percent / 100)';
COMMENT ON COLUMN public.sessions.penalty_resolution IS 'How the penalty was resolved: pending, credit_applied, refunded, invoiced, paid';
COMMENT ON COLUMN public.sessions.credit_applied_amount IS 'Amount of student credit applied to reduce the payment for this session';
COMMENT ON COLUMN public.students.credit_balance IS 'Credit balance in EUR from overpaid cancelled lessons, applied to future lessons';

-- =====================================================
-- Migration: 20260407000001_invoice_issuance_system.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS public.invoice_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id     UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type         TEXT NOT NULL CHECK (entity_type IN (
    'verslo_liudijimas', 'individuali_veikla', 'mb', 'uab', 'ii'
  )),
  business_name       TEXT,
  company_code        TEXT,
  vat_code            TEXT,
  address             TEXT,
  activity_number     TEXT,
  personal_code       TEXT,
  contact_email       TEXT,
  contact_phone       TEXT,
  invoice_series      TEXT NOT NULL DEFAULT 'SF',
  next_invoice_number INT NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT one_owner CHECK (
    (user_id IS NOT NULL AND organization_id IS NULL) OR
    (user_id IS NULL AND organization_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_profiles_user
  ON public.invoice_profiles(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_profiles_org
  ON public.invoice_profiles(organization_id) WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number      TEXT NOT NULL,
  issued_by_user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id     UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  seller_snapshot     JSONB NOT NULL,
  buyer_snapshot      JSONB NOT NULL,
  issue_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  period_start        DATE,
  period_end          DATE,
  grouping_type       TEXT CHECK (grouping_type IN ('per_payment', 'per_week', 'single')),
  subtotal            NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'paid', 'cancelled')),
  pdf_storage_path    TEXT,
  billing_batch_id    UUID REFERENCES public.billing_batches(id) ON DELETE SET NULL,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_issued_by ON public.invoices(issued_by_user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id          UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description         TEXT NOT NULL,
  quantity            INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price          NUMERIC(10,2) NOT NULL,
  total_price         NUMERIC(10,2) NOT NULL,
  session_ids         UUID[] DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON public.invoice_line_items(invoice_id);

ALTER TABLE public.invoice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_profiles_tutor_all" ON public.invoice_profiles
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "invoice_profiles_org_admin_all" ON public.invoice_profiles
  FOR ALL USING (
    organization_id IN (
      SELECT oa.organization_id FROM public.organization_admins oa WHERE oa.user_id = auth.uid()
    )
  );
CREATE POLICY "invoices_tutor_all" ON public.invoices
  FOR ALL USING (auth.uid() = issued_by_user_id);
CREATE POLICY "invoices_org_admin_select" ON public.invoices
  FOR SELECT USING (
    organization_id IN (
      SELECT oa.organization_id FROM public.organization_admins oa WHERE oa.user_id = auth.uid()
    )
  );
CREATE POLICY "invoice_line_items_via_invoice" ON public.invoice_line_items
  FOR ALL USING (
    invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.issued_by_user_id = auth.uid())
  );
CREATE POLICY "invoice_line_items_org_admin_select" ON public.invoice_line_items
  FOR SELECT USING (
    invoice_id IN (
      SELECT i.id FROM public.invoices i
      WHERE i.organization_id IN (
        SELECT oa.organization_id FROM public.organization_admins oa WHERE oa.user_id = auth.uid()
      )
    )
  );

GRANT ALL ON public.invoice_profiles TO service_role, authenticated;
GRANT ALL ON public.invoices TO service_role, authenticated;
GRANT ALL ON public.invoice_line_items TO service_role, authenticated;

COMMENT ON TABLE public.invoice_profiles IS 'Business entity details for invoice issuance (seller info)';
COMMENT ON TABLE public.invoices IS 'Formal S.F. (saskaita faktura) documents issued by tutors/orgs';
COMMENT ON TABLE public.invoice_line_items IS 'Line items for each issued invoice';

-- =====================================================
-- Migration: 20260407120000_profiles_preferred_locale
-- =====================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_locale text
    CHECK (preferred_locale IS NULL OR preferred_locale IN ('lt', 'en', 'pl', 'lv', 'ee'));

