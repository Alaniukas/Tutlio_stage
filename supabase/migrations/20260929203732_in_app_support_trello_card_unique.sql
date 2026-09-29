-- A Trello card must never be able to control more than one customer ticket.
create unique index if not exists in_app_support_requests_trello_card_id_unique
  on public.in_app_support_requests (trello_card_id)
  where trello_card_id is not null;
