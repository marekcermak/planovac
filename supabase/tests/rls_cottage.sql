-- Testy: Chata (cottage_items) jen pro domácnost, horizont úkolů a opakování.
-- Běží v transakci s ROLLBACK. Chyba = výjimka „FAIL…“.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000000a', 'test-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000c', 'test-c@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare v_hh uuid; v_task uuid; v_next uuid;
begin
  v_hh := public.create_household('Domácnost A', 'A', '#2563eb');
  perform set_config('test.hh_a', v_hh::text, true);
  insert into public.cottage_items (household_id, direction, text) values (v_hh, 'to_cottage', 'Dřevo');
  insert into public.cottage_items (household_id, direction, text) values (v_hh, 'to_prague', 'Prádlo');
  begin
    insert into public.cottage_items (household_id, direction, text) values (v_hh, 'jinam', 'X');
    raise exception 'FAIL: neplatný směr prošel';
  exception when check_violation then null;
  end;

  insert into public.tasks (household_id, title) values (v_hh, 'Nový') returning id into v_task;
  if (select horizon from public.tasks where id = v_task) <> 'week' then
    raise exception 'FAIL: výchozí horizont není week';
  end if;

  insert into public.tasks (household_id, title, horizon, recurrence, due_date, is_work)
    values (v_hh, 'Opakovaný', 'long', 'weekly', public.today_prague(), true) returning id into v_task;
  v_next := public.set_task_done(v_task, true);
  if (select horizon from public.tasks where id = v_next) <> 'long' then
    raise exception 'FAIL: další výskyt dlouhodobého úkolu není dlouhodobý';
  end if;
  if not (select is_work from public.tasks where id = v_next) then
    raise exception 'FAIL: další výskyt pracovního úkolu není pracovní';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.cottage_items) then
    raise exception 'FAIL: C vidí cizí věci na chatu';
  end if;
  begin
    insert into public.cottage_items (household_id, direction, text)
      values (current_setting('test.hh_a')::uuid, 'to_cottage', 'Vetřelec');
    raise exception 'FAIL: C zapsal do cizí domácnosti';
  exception when insufficient_privilege then null;
  end;
  update public.cottage_items set packed = true;
  delete from public.cottage_items;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.cottage_items where not packed) <> 2 then
    raise exception 'FAIL: C změnil / smazal věci domácnosti A';
  end if;
end $$;

select 'rls_cottage OK' as result;
rollback;
