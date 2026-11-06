-- Fáze 5b: návyky (nastavitelné, např. sport s druhem a poznámkou) a denní záznam (nálada 1–5 + co mi udělalo radost).
-- Vše SOUKROMÉ: vidí a mění jen vlastník (SPEC kap. 3), ani druhý člen domácnosti.

create table public.habits (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 60),
  icon             text not null default '✅' check (char_length(icon) <= 16),
  -- daily = každý den, days = vybrané dny v týdnu (1 = po … 7 = ne), per_week = X× týdně kdykoli
  schedule         text not null default 'daily' check (schedule in ('daily', 'days', 'per_week')),
  days             smallint[] not null default '{}' check (days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  per_week         smallint check (per_week between 1 and 7),
  -- check = jen splněno; activity = zápis s druhem (Běh, Kolo…) a poznámkou, víc zápisů za den
  kind             text not null default 'check' check (kind in ('check', 'activity')),
  activity_types   text[] not null default '{}',
  show_on_display  boolean not null default false,
  sort             int not null default 0,
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (id, owner_id),
  check (schedule <> 'days' or cardinality(days) > 0),
  check (schedule <> 'per_week' or per_week is not null)
);
create index habits_owner_idx on public.habits (owner_id, archived, sort);

create table public.habit_logs (
  id             uuid primary key default gen_random_uuid(),
  habit_id       uuid not null,
  owner_id       uuid not null default auth.uid(),
  date           date not null default public.today_prague(),
  activity_type  text check (char_length(activity_type) <= 40),
  note           text check (char_length(note) <= 1000),
  created_at     timestamptz not null default now(),
  -- Zápis patří vlastníkovi návyku (složený klíč brání zápisu do cizího návyku).
  foreign key (habit_id, owner_id) references public.habits (id, owner_id) on delete cascade
);
create index habit_logs_habit_idx on public.habit_logs (habit_id, date desc);
create index habit_logs_owner_idx on public.habit_logs (owner_id, date desc);

create table public.day_entries (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date          date not null default public.today_prague(),
  mood          smallint check (mood between 1 and 5),
  joy           text check (char_length(joy) <= 4000),
  updated_at    timestamptz not null default now(),
  unique (owner_id, date)
);

create function public.day_entries_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.owner_id := old.owner_id;
  return new;
end;
$$;
create trigger day_entries_touch before update on public.day_entries
  for each row execute function public.day_entries_touch();

create function public.habits_keep_owner()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.owner_id := old.owner_id;
  new.household_id := old.household_id;
  return new;
end;
$$;
create trigger habits_keep_owner before update on public.habits
  for each row execute function public.habits_keep_owner();

revoke all on public.habits, public.habit_logs, public.day_entries from anon, authenticated;
grant select, insert, update, delete on public.habits, public.habit_logs, public.day_entries to authenticated;
alter table public.habits      enable row level security;
alter table public.habit_logs  enable row level security;
alter table public.day_entries enable row level security;

create policy habits_owner on public.habits for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.is_household_member(household_id));
create policy habit_logs_owner on public.habit_logs for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy day_entries_owner on public.day_entries for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.is_household_member(household_id));

alter publication supabase_realtime add table public.habits, public.habit_logs, public.day_entries;
