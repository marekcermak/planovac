-- RLS testy fáze 5b (návyky, denní záznam – soukromé). Spouští se: npm run db:test
-- A a B jsou ve stejné domácnosti; B nesmí vidět ani měnit nic z A.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-000000005ba0', 'test5b-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000005bb0', 'test5b-b@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000005ba0","role":"authenticated"}', true);

do $$
declare v_hh uuid; v_habit uuid;
begin
  v_hh := public.create_household('Návyky test', 'A', '#2563eb');
  perform set_config('test.hh', v_hh::text, true);
  perform set_config('test.token', public.create_invite(v_hh), true);

  insert into public.habits (household_id, name, kind, activity_types) values (v_hh, 'Sport', 'activity', array['Běh', 'Kolo'])
    returning id into v_habit;
  perform set_config('test.habit', v_habit::text, true);
  insert into public.habit_logs (habit_id, activity_type, note) values (v_habit, 'Běh', 'kolem přehrady');
  insert into public.day_entries (household_id, mood, joy) values (v_hh, 4, 'Procházka s Markétou');

  if (select date from public.habit_logs where habit_id = v_habit) <> public.today_prague() then
    raise exception 'FAIL: datum zápisu se nedoplnilo';
  end if;

  begin
    insert into public.habits (household_id, name, schedule) values (v_hh, 'x', 'days');
    raise exception 'FAIL: návyk „vybrané dny“ bez dnů';
  exception when check_violation then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000005bb0","role":"authenticated"}', true);

do $$
declare v_hh uuid := current_setting('test.hh')::uuid; v_n int;
begin
  perform public.accept_invite(current_setting('test.token'), 'B', '#db2777');

  if (select count(*) from public.habits) <> 0 then raise exception 'FAIL: B vidí návyky A'; end if;
  if (select count(*) from public.habit_logs) <> 0 then raise exception 'FAIL: B vidí zápisy A'; end if;
  if (select count(*) from public.day_entries) <> 0 then raise exception 'FAIL: B vidí náladu / radost A'; end if;

  update public.day_entries set joy = 'hack';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: B změnil záznam A'; end if;
  delete from public.habits;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: B smazal návyk A'; end if;

  -- Zápis do cizího návyku (i s vlastním owner_id) nesmí projít.
  begin
    insert into public.habit_logs (habit_id) values (current_setting('test.habit')::uuid);
    raise exception 'FAIL: B zapsal do návyku A';
  exception when foreign_key_violation then null;
  end;
  -- Záznam za A nejde založit.
  begin
    insert into public.day_entries (household_id, owner_id, joy) values (v_hh, '00000000-0000-4000-8000-000000005ba0', 'x');
    raise exception 'FAIL: B založil záznam za A';
  exception when insufficient_privilege then null;
  end;
  -- Vlastní záznam B jde, ale jen jeden za den.
  insert into public.day_entries (household_id, mood) values (v_hh, 3);
  begin
    insert into public.day_entries (household_id, mood) values (v_hh, 2);
    raise exception 'FAIL: dva záznamy za den';
  exception when unique_violation then null;
  end;
end $$;

rollback;
