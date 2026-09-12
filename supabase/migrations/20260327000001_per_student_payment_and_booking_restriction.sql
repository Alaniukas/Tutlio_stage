-- Feature #8: Per-student payment model override
alter table public.students
  add column if not exists payment_model text
    check (payment_model in ('before_lesson', 'after_lesson', 'monthly', 'packages'))
    default null;
-- Feature #9: Block booking if student has unpaid sessions
alter table public.profiles
  add column if not exists restrict_booking_on_overdue boolean default false;
