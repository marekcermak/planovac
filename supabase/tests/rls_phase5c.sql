-- RLS testy fáze 5c (deník). Spouští se: npm run db:test
-- A a B jsou ve stejné domácnosti, C je cizí. Soukromé kapitoly vidí jen vlastník, sdílené celá domácnost.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-000000005ca0', 'test5c-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000005cb0', 'test5c-b@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000005cc0', 'test5c-c@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000005ca0","role":"authenticated"}', true);

do $$
declare v_hh uuid; v_private uuid; v_shared uuid; v_entry uuid;
begin
  v_hh := public.create_household('Deník test', 'A', '#2563eb');
  perform set_config('test.hh', v_hh::text, true);
  perform set_config('test.token', public.create_invite(v_hh), true);

  perform public.ensure_journal_defaults();
  perform public.ensure_journal_defaults(); -- podruhé nic nepřidá
  if (select count(*) from public.journal_chapters where owner_id = auth.uid()) <> 2 then
    raise exception 'FAIL: výchozí kapitoly';
  end if;
  select id into v_private from public.journal_chapters where owner_id = auth.uid() and name = 'Myšlenky';
  insert into public.journal_chapters (household_id, name, visibility) values (v_hh, 'Společné', 'shared') returning id into v_shared;
  perform set_config('test.private', v_private::text, true);
  perform set_config('test.shared', v_shared::text, true);

  insert into public.journal_entries (household_id, chapter_id, body, photo_paths)
    values (v_hh, v_private, 'Tajná myšlenka', array[v_hh || '/00000000-0000-4000-8000-000000005ca0/x/a.jpg'])
    returning id into v_entry;
  perform set_config('test.entry', v_entry::text, true);
  insert into public.journal_entries (household_id, chapter_id, body, photo_paths)
    values (v_hh, v_shared, 'Dovolená v Itálii', array[v_hh || '/00000000-0000-4000-8000-000000005ca0/y/b.jpg']);

  if (select entry_date from public.journal_entries where id = v_entry) <> public.today_prague() then
    raise exception 'FAIL: datum zápisu';
  end if;
end $$;

-- ---------- B: člen domácnosti ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000005cb0","role":"authenticated"}', true);

do $$
declare v_hh uuid := current_setting('test.hh')::uuid; v_n int;
begin
  perform public.accept_invite(current_setting('test.token'), 'B', '#db2777');

  if exists (select 1 from public.journal_chapters where id = current_setting('test.private')::uuid) then
    raise exception 'FAIL: B vidí soukromou kapitolu A';
  end if;
  if not exists (select 1 from public.journal_chapters where id = current_setting('test.shared')::uuid) then
    raise exception 'FAIL: B nevidí sdílenou kapitolu';
  end if;
  if exists (select 1 from public.journal_entries where id = current_setting('test.entry')::uuid) then
    raise exception 'FAIL: B vidí soukromý zápis A';
  end if;
  if (select count(*) from public.journal_entries where chapter_id = current_setting('test.shared')::uuid) <> 1 then
    raise exception 'FAIL: B nevidí zápis ve sdílené kapitole';
  end if;

  -- Fotky: sdílená ano, soukromá ne.
  if not public.journal_photo_readable(v_hh || '/00000000-0000-4000-8000-000000005ca0/y/b.jpg') then
    raise exception 'FAIL: B nevidí fotku ze sdílené kapitoly';
  end if;
  if public.journal_photo_readable(v_hh || '/00000000-0000-4000-8000-000000005ca0/x/a.jpg') then
    raise exception 'FAIL: B vidí fotku ze soukromé kapitoly';
  end if;

  -- Do sdílené kapitoly B zapsat smí, do soukromé A ne; cizí zápis neupraví.
  insert into public.journal_entries (household_id, chapter_id, body) values (v_hh, current_setting('test.shared')::uuid, 'Taky jsem tam byl');
  begin
    insert into public.journal_entries (household_id, chapter_id, body) values (v_hh, current_setting('test.private')::uuid, 'x');
    raise exception 'FAIL: B zapsal do soukromé kapitoly A';
  exception when insufficient_privilege then null;
  end;
  update public.journal_entries set body = 'hack' where owner_id <> auth.uid();
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: B upravil cizí zápis'; end if;
  update public.journal_chapters set name = 'hack' where id = current_setting('test.shared')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: B přejmenoval cizí kapitolu'; end if;
  delete from public.journal_entries where owner_id <> auth.uid();
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: B smazal cizí zápis'; end if;

  -- Vlastní zápis nejde přesunout do cizí soukromé kapitoly.
  begin
    update public.journal_entries set chapter_id = current_setting('test.private')::uuid where owner_id = auth.uid();
    raise exception 'FAIL: B přesunul zápis do soukromé kapitoly A';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- C: cizí ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000005cc0","role":"authenticated"}', true);

do $$
declare v_hh uuid := current_setting('test.hh')::uuid;
begin
  if (select count(*) from public.journal_chapters) <> 0 then raise exception 'FAIL: C vidí cizí kapitoly'; end if;
  if (select count(*) from public.journal_entries) <> 0 then raise exception 'FAIL: C vidí cizí zápisy'; end if;
  if public.journal_photo_readable(v_hh || '/00000000-0000-4000-8000-000000005ca0/y/b.jpg') then
    raise exception 'FAIL: C vidí fotku ze sdílené kapitoly cizí domácnosti';
  end if;
  begin
    insert into public.journal_entries (household_id, chapter_id, body) values (v_hh, current_setting('test.shared')::uuid, 'x');
    raise exception 'FAIL: C zapsal do cizí kapitoly';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
