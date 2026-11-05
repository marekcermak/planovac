-- Fáze 3: mezipaměť Open Food Facts. Čte a píše jen Edge Function off-lookup (service role),
-- klient k tabulce přístup nemá (RLS bez politik).

create table public.off_cache (
  barcode     text primary key check (barcode ~ '^[0-9]{6,14}$'),
  found       boolean not null,
  data        jsonb not null default '{}'::jsonb,
  fetched_at  timestamptz not null default now()
);

revoke all on public.off_cache from anon, authenticated;
alter table public.off_cache enable row level security;
