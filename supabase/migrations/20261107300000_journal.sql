-- Fáze 5c: deník – kapitoly, zápisy, fotky poznámek.
-- Kapitola je soukromá (vidí jen vlastník) nebo sdílená (čte celá domácnost); viditelnost zápisu se dědí z kapitoly.

create table public.journal_chapters (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  icon          text not null default '📓' check (char_length(icon) <= 16),
  sort          int not null default 0,
  visibility    text not null default 'private' check (visibility in ('private', 'shared')),
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (id, household_id)
);
create index journal_chapters_owner_idx on public.journal_chapters (owner_id, sort);

create table public.journal_entries (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chapter_id    uuid not null,
  title         text check (char_length(title) <= 200),
  body          text not null default '' check (char_length(body) <= 50000),
  entry_date    date not null default public.today_prague(),
  source_type   text not null default 'vlastni'
                check (source_type in ('vlastni', 'kniha', 'clanek', 'podcast', 'rozhovor', 'jine')),
  source_ref    text check (char_length(source_ref) <= 300),
  tags          text[] not null default '{}',
  pinned        boolean not null default false,
  photo_paths   text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (chapter_id, household_id) references public.journal_chapters (id, household_id) on delete cascade
);
create index journal_entries_chapter_idx on public.journal_entries (chapter_id, entry_date desc);
create index journal_entries_owner_idx on public.journal_entries (owner_id, entry_date desc);

-- Smí uživatel kapitolu číst? (vlastník, nebo sdílená a člen domácnosti)
create function public.can_read_chapter(p_chapter_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.journal_chapters c
    where c.id = p_chapter_id
      and (c.owner_id = auth.uid() or (c.visibility = 'shared' and public.is_household_member(c.household_id)))
  );
$$;
revoke execute on function public.can_read_chapter(uuid) from public, anon;
grant execute on function public.can_read_chapter(uuid) to authenticated;

create function public.journal_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.owner_id := old.owner_id;
  new.household_id := old.household_id;
  if tg_table_name = 'journal_entries' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger journal_chapters_touch before update on public.journal_chapters
  for each row execute function public.journal_touch();
create trigger journal_entries_touch before update on public.journal_entries
  for each row execute function public.journal_touch();

revoke all on public.journal_chapters, public.journal_entries from anon, authenticated;
grant select, insert, update, delete on public.journal_chapters, public.journal_entries to authenticated;
alter table public.journal_chapters enable row level security;
alter table public.journal_entries  enable row level security;

-- Kapitoly: čte vlastník (a domácnost u sdílených), mění jen vlastník.
create policy journal_chapters_select on public.journal_chapters for select to authenticated
  using (owner_id = (select auth.uid()) or (visibility = 'shared' and public.is_household_member(household_id)));
create policy journal_chapters_write on public.journal_chapters for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.is_household_member(household_id));

-- Zápisy: čte, kdo smí číst kapitolu; zapisuje vlastník zápisu, a to jen do kapitoly, kterou vlastní
-- nebo která je sdílená.
create policy journal_entries_select on public.journal_entries for select to authenticated
  using (owner_id = (select auth.uid()) or public.can_read_chapter(chapter_id));
create policy journal_entries_insert on public.journal_entries for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.is_household_member(household_id) and public.can_read_chapter(chapter_id));
create policy journal_entries_update on public.journal_entries for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.can_read_chapter(chapter_id));
create policy journal_entries_delete on public.journal_entries for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Výchozí kapitoly „Myšlenky“ a „Deník“ pro přihlášeného uživatele (jen když žádné nemá).
create function public.ensure_journal_defaults()
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_hh uuid;
begin
  select household_id into v_hh from public.household_members where user_id = auth.uid();
  if v_hh is null or exists (select 1 from public.journal_chapters where owner_id = auth.uid()) then
    return;
  end if;
  insert into public.journal_chapters (household_id, name, icon, sort) values
    (v_hh, 'Myšlenky', '💭', 0),
    (v_hh, 'Deník', '📓', 1);
end;
$$;
revoke execute on function public.ensure_journal_defaults() from public, anon;
grant execute on function public.ensure_journal_defaults() to authenticated;

-- ---------------------------------------------------------------------------
-- Fotky: bucket journal-photos, cesta {household_id}/{owner_id}/{entry_id}/{soubor}
-- Nahrává a maže jen vlastník; číst smí i domácnost, pokud je fotka u zápisu ve sdílené kapitole.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journal-photos', 'journal-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create function public.journal_photo_readable(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select split_part(p_name, '/', 2) = auth.uid()::text
      or exists (
        select 1 from public.journal_entries e
        join public.journal_chapters c on c.id = e.chapter_id
        where p_name = any (e.photo_paths) and c.visibility = 'shared' and public.is_household_member(c.household_id)
      );
$$;
revoke execute on function public.journal_photo_readable(text) from public, anon;
grant execute on function public.journal_photo_readable(text) to authenticated;

create policy journal_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'journal-photos' and public.journal_photo_readable(name));
create policy journal_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'journal-photos' and public.storage_household_member(name)
              and split_part(name, '/', 2) = (select auth.uid())::text);
create policy journal_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'journal-photos' and split_part(name, '/', 2) = (select auth.uid())::text);

alter publication supabase_realtime add table public.journal_chapters, public.journal_entries;
