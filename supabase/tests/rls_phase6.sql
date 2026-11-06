-- Testy fáze 6 (Živý obraz). Spouští se: npm run db:test
-- A (správce) a B jsou v domácnosti, C je cizí. Běží v transakci s ROLLBACK (pg_net nic neodešle).

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000006a0', 'test6-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000006b0', 'test6-b@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000006c0', 'test6-c@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006a0","role":"authenticated"}', true);

do $$
declare v_hh uuid; v_habit uuid; v_v jsonb;
begin
  v_hh := public.create_household('Displej test', 'Marek', '#2563eb');
  perform set_config('test.hh', v_hh::text, true);
  perform set_config('test.token', public.create_invite(v_hh), true);

  update public.settings set zivyobraz_enabled = true,
    display_fields = '{"prochazi": true, "jidlo": true, "ukoly": true, "nakup": true}' where household_id = v_hh;
  perform public.set_display_key(v_hh, 'test-klic-12345');

  begin
    perform public.set_display_key(v_hh, 'kratky');
    raise exception 'FAIL: přijat krátký klíč';
  exception when sqlstate '22023' then null;
  end;

  -- Úkol je ve výchozím stavu soukromý.
  insert into public.tasks (household_id, title, due_date) values (v_hh, 'Tajný dárek', public.today_prague());
  if (select visibility from public.tasks where title = 'Tajný dárek') <> 'private' then raise exception 'FAIL: úkol není výchozí soukromý'; end if;
  -- Společné úkoly: dnes a tento týden (neděle = dnes+0..6 podle dne v týdnu).
  insert into public.tasks (household_id, title, due_date, visibility) values (v_hh, 'Vynést koš', public.today_prague(), 'shared');
  insert into public.tasks (household_id, title, due_date, visibility)
    values (v_hh, 'Kino s Markétou', public.today_prague() + 1, 'shared');
  -- Návyk na displej nepatří vůbec.
  insert into public.habits (household_id, name, show_on_display) values (v_hh, 'Tajný návyk', true) returning id into v_habit;
  insert into public.habit_logs (habit_id) values (v_habit);
  insert into public.display_pins (household_id, text, slot) values (v_hh, 'Zavolat babičce', 1);
  insert into public.shopping_items (household_id, text) values (v_hh, 'mléko');
  insert into public.meal_plan (household_id, date, text) values (v_hh, public.today_prague() + 1, 'Kuře na paprice');

  v_v := public.display_preview(v_hh);
  if v_v ->> 'ukoly_dnes' <> 'Vynést koš' then raise exception 'FAIL: ukoly_dnes = %', v_v ->> 'ukoly_dnes'; end if;
  if extract(isodow from public.today_prague()) < 7 and v_v ->> 'ukoly_tyden' <> 'Kino s Markétou' then
    raise exception 'FAIL: ukoly_tyden = %', v_v ->> 'ukoly_tyden';
  end if;
  if v_v ->> 'jidlo_zitra' <> 'Kuře na paprice' then raise exception 'FAIL: jidlo_zitra = %', v_v ->> 'jidlo_zitra'; end if;
  if v_v ->> 'jidlo_dnes' <> '' then raise exception 'FAIL: jidlo_dnes'; end if;
  if v_v ->> 'jidlo_tyden' not like '%Kuře na paprice' then raise exception 'FAIL: jidlo_tyden = %', v_v ->> 'jidlo_tyden'; end if;
  if v_v ->> 'marek_pripnuto_1' <> 'Zavolat babičce' then raise exception 'FAIL: pin'; end if;
  if v_v ->> 'nakup_pocet' <> '1' then raise exception 'FAIL: nákup'; end if;
  if v_v::text like '%Tajn%' then raise exception 'FAIL: na displej jde soukromé / návyk: %', v_v; end if;
  if (select count(*) from jsonb_object_keys(v_v)) > 15 then raise exception 'FAIL: moc hodnot'; end if;

  -- Vypnuté pole se neposílá vůbec (zivyobraz.eu zvládne ~15 hodnot na požadavek).
  update public.settings set display_fields = '{"ukoly": false}' where household_id = v_hh;
  if public.display_preview(v_hh) ? 'ukoly_dnes' then raise exception 'FAIL: vypnuté úkoly se posílají'; end if;

  if not public.push_display_now(v_hh) then raise exception 'FAIL: odeslání neproběhlo'; end if;
  if not (public.display_status(v_hh) ->> 'has_key')::boolean then raise exception 'FAIL: status bez klíče'; end if;

  -- Klíč klient nepřečte.
  begin
    perform import_key from public.display_config;
    raise exception 'FAIL: klient čte display_config';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Kontrola odeslání (display_config čte jen správce DB).
reset role;
do $$
declare v_hh uuid := current_setting('test.hh')::uuid;
begin
  -- Společné hodnoty + 1 požadavek na člena.
  if (select cardinality(last_request_ids) from public.display_config where household_id = v_hh) <> 2 then
    raise exception 'FAIL: počet požadavků';
  end if;
  -- Druhé odeslání do minuty jen označí změnu.
  perform public.push_display_now(v_hh);
  if (select dirty_at from public.display_config where household_id = v_hh) is null then
    raise exception 'FAIL: odeslání do minuty neoznačilo změnu';
  end if;
end $$;
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006b0","role":"authenticated"}', true);

do $$
declare v_hh uuid := current_setting('test.hh')::uuid; v_n int;
begin
  perform public.accept_invite(current_setting('test.token'), 'Markéta', '#db2777');

  if public.display_preview(v_hh) ->> 'marketa_pripnuto' is null then raise exception 'FAIL: chybí hodnoty pro Markétu'; end if;
  if (select count(*) from public.display_pins where household_id = v_hh) <> 1 then raise exception 'FAIL: B nevidí piny'; end if;
  update public.display_pins set text = 'hack' where household_id = v_hh;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: B změnil cizí pin'; end if;

  begin
    perform public.set_display_key(v_hh, 'jiny-klic-12345');
    raise exception 'FAIL: B (ne správce) změnil klíč';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000006c0","role":"authenticated"}', true);

do $$
declare v_hh uuid := current_setting('test.hh')::uuid;
begin
  if (select count(*) from public.display_pins) <> 0 then raise exception 'FAIL: C vidí cizí piny'; end if;
  if (select count(*) from public.meal_plan) <> 0 then raise exception 'FAIL: C vidí cizí jídelníček'; end if;
  begin
    insert into public.meal_plan (household_id, date, text) values (v_hh, public.today_prague(), 'x');
    raise exception 'FAIL: C zapsal do cizího jídelníčku';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.display_preview(v_hh);
    raise exception 'FAIL: C vidí náhled cizího displeje';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.push_display_now(v_hh);
    raise exception 'FAIL: C odeslal cizí displej';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
