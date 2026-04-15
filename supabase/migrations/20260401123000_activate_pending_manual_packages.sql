-- Show already-sent manual packages in org_admin UI so payment can be confirmed.
-- Previously some manual packages were created with active=false, which hid them.
update public.lesson_packages
set active = true
where active = false
  and payment_method = 'manual'
  and coalesce(payment_status, 'pending') = 'pending'
  and coalesce(paid, false) = false;
