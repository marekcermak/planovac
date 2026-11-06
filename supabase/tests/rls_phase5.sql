-- RLS testy fáze 5a (úkoly). Spouští se: npm run db:test
-- Běží v transakci s ROLLBACK. Chyba = výjimka „FAIL…“.
-- A a B jsou ve stejné domácnosti, C je cizí.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000005a0', 'test5-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000005b0', 'test5-b@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000005c0', 'test5-c@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;

-- ---------- A: domácnost, pozvánka, úkoly ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000005a0","role":"authenticated"}', true);

do $$
declare v_hh uuid; v_shared uuid; v_private uuid;
begin
  v_hh := public.create_household('Úkoly test', 'A', '#2563eb');
  perform set_config('test.hh', v_hh::text, true);
  perform set_config('test.token', public.create_invite(v_hh), true);

  insert into public.tasks (household_id, title) values (v_hh, 'Vynést koš') returning id into v_shared;
  insert into public.tasks (household_id, title, visibility) values (v_hh, 'Dárek pro B', 'private') returning id into v_private;
  perform set_config('test.shared', v_shared::text, true);
  perform set_config('test.private', v_private::text, true);

  -- Cizí owner_id při vložení nejde.
  begin
    insert into public.tasks (household_id, title, owner_id) values (v_hh, 'x', '00000000-0000-4000-8000-0000000005b0');
    raise exception 'FAIL: A založil úkol za někoho jiného';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- B: přijme pozvánku ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000005b0","role":"authenticated"}', true);

do $$
declare v_hh uuid := current_setting('test.hh')::uuid; v_n int; v_next uuid;
begin
  perform public.accept_invite(current_setting('test.token'), 'B', '#db2777');

  if not exists (select 1 from public.tasks where id = current_setting('test.shared')::uuid) then
    raise exception 'FAIL: B nevidí sdílený úkol';
  end if;
  if exists (select 1 from public.tasks where id = current_setting('test.private')::uuid) then
    raise exception 'FAIL: B vidí soukromý úkol A';
  end if;

  update public.tasks set title = 'hack' where id = current_setting('test.private')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: B změnil soukromý úkol A'; end if;
  delete from public.tasks where id = current_setting('test.private')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: B smazal soukromý úkol A'; end if;

  begin
    perform public.set_task_done(current_setting('test.private')::uuid, true);
    raise exception 'FAIL: B odškrtl soukromý úkol A';
  exception when sqlstate 'P0002' then null;
  end;

  -- Sdílený úkol B smí upravit a přiřadit sobě, ale ne udělat z něj soukromý úkol A.
  update public.tasks set assignee_id = auth.uid(), due_date = '2026-11-10', recurrence = 'weekly'
    where id = current_setting('test.shared')::uuid;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FAIL: B neupravil sdílený úkol'; end if;
  begin
    update public.tasks set visibility = 'private', assignee_id = null where id = current_setting('test.shared')::uuid;
    raise exception 'FAIL: B udělal z cizího úkolu soukromý';
  exception when insufficient_privilege then null;
  end;
  -- Vlastník se změnit nedá (trigger ho vrátí).
  update public.tasks set owner_id = auth.uid() where id = current_setting('test.shared')::uuid;
  if (select owner_id from public.tasks where id = current_setting('test.shared')::uuid) <> '00000000-0000-4000-8000-0000000005a0' then
    raise exception 'FAIL: B změnil vlastníka';
  end if;

  -- Soukromý úkol nejde přiřadit jinému.
  begin
    insert into public.tasks (household_id, title, visibility, assignee_id)
      values (v_hh, 'x', 'private', '00000000-0000-4000-8000-0000000005a0');
    raise exception 'FAIL: soukromý úkol přiřazen jinému';
  exception when check_violation then null;
  end;

  -- Opakování: hotovo založí další výskyt (týden), vrácení ho smaže.
  v_next := public.set_task_done(current_setting('test.shared')::uuid, true);
  if v_next is null then raise exception 'FAIL: opakovaný úkol nemá další výskyt'; end if;
  if (select due_date from public.tasks where id = v_next) < public.today_prague()
     or extract(isodow from (select due_date from public.tasks where id = v_next)) <> extract(isodow from date '2026-11-10') then
    raise exception 'FAIL: špatný termín dalšího výskytu %', (select due_date from public.tasks where id = v_next);
  end if;
  if (select assignee_id from public.tasks where id = v_next) <> auth.uid() then raise exception 'FAIL: přiřazení se nepřeneslo'; end if;
  perform public.set_task_done(current_setting('test.shared')::uuid, false);
  if exists (select 1 from public.tasks where id = v_next) then raise exception 'FAIL: vrácení nesmazalo další výskyt'; end if;
  if (select done_at from public.tasks where id = current_setting('test.shared')::uuid) is not null then
    raise exception 'FAIL: vrácení nevrátilo úkol';
  end if;
end $$;

-- ---------- next_due ----------
do $$
begin
  if public.next_due('2026-11-06', 'weekdays') <> '2026-11-09' then raise exception 'FAIL: pátek → pondělí'; end if;
  if public.next_due('2026-11-04', 'weekdays') <> '2026-11-05' then raise exception 'FAIL: středa → čtvrtek'; end if;
  if public.next_due('2026-01-31', 'monthly') <> '2026-02-28' then raise exception 'FAIL: konec měsíce'; end if;
  if public.next_due('2026-11-06', 'daily') <> '2026-11-07' then raise exception 'FAIL: denně'; end if;
end $$;

-- ---------- C: cizí ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000005c0","role":"authenticated"}', true);

do $$
declare v_hh uuid := current_setting('test.hh')::uuid; v_n int;
begin
  if (select count(*) from public.tasks where household_id = v_hh) <> 0 then raise exception 'FAIL: C vidí cizí úkoly'; end if;
  update public.tasks set title = 'hack' where household_id = v_hh;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: C změnil cizí úkol'; end if;
  begin
    insert into public.tasks (household_id, title) values (v_hh, 'x');
    raise exception 'FAIL: C vložil úkol do cizí domácnosti';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_task_done(current_setting('test.shared')::uuid, true);
    raise exception 'FAIL: C odškrtl cizí úkol';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

rollback;
