-- Testy: přechod do jiné domácnosti přes pozvánku (switch_household) a stav naplnění (set_stock_fill).
-- Běží v transakci s ROLLBACK. Chyba = výjimka „FAIL…“.
--
-- A = domácnost s daty (admin), B = omylem založila vlastní domácnost, C = cizí.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000000a', 'test-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'test-b@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000c', 'test-c@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;

-- ---------- A: domácnost, produkt, položka, pozvánka ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare v_hh uuid; v_prod uuid; v_item uuid;
begin
  v_hh := public.create_household('Domácnost A', 'A', '#2563eb');
  insert into public.products (household_id, name) values (v_hh, 'Mléko') returning id into v_prod;
  v_item := public.add_stock(v_prod);
  perform set_config('test.hh_a', v_hh::text, true);
  perform set_config('test.item', v_item::text, true);
  perform set_config('test.token', public.create_invite(v_hh), true);
  perform set_config('test.token2', public.create_invite(v_hh), true);

  if (select fill_level from public.stock_items where id = v_item) <> 2 then
    raise exception 'FAIL: nová položka není plná';
  end if;
  perform public.set_stock_fill(v_item, 1);
  perform public.set_stock_fill(v_item, 0);
  if (select fill_level from public.stock_items where id = v_item) <> 0 then
    raise exception 'FAIL: set_stock_fill neuložil prázdnou';
  end if;
  begin
    perform public.set_stock_fill(v_item, 3);
    raise exception 'FAIL: set_stock_fill přijal 3';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.switch_household(current_setting('test.token2'), 'A', '#2563eb');
    raise exception 'FAIL: A přešel do vlastní domácnosti (smazal by ji)';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  if not exists (select 1 from public.households where id = v_hh) then
    raise exception 'FAIL: domácnost A zmizela';
  end if;
end $$;

-- ---------- C nesmí měnit naplnění cizí položky ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.set_stock_fill(current_setting('test.item')::uuid, 2);
    raise exception 'FAIL: C změnil naplnění cizí položky';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

-- ---------- B: vlastní domácnost s daty → přejde k A, stará se smaže ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare v_hh_b uuid; v_prod uuid; v_res uuid;
begin
  v_hh_b := public.create_household('Domácnost B', 'B', '#db2777');
  insert into public.products (household_id, name) values (v_hh_b, 'Chleba') returning id into v_prod;
  perform public.add_stock(v_prod);
  perform set_config('test.hh_b', v_hh_b::text, true);

  if (select stock_items from public.current_household_summary()) <> 1 then
    raise exception 'FAIL: souhrn domácnosti B nesedí';
  end if;

  begin
    perform public.accept_invite(current_setting('test.token'), 'B', '#db2777');
    raise exception 'FAIL: accept_invite pustil člena jiné domácnosti';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  v_res := public.switch_household(current_setting('test.token'), 'B', '#db2777');
  if v_res <> current_setting('test.hh_a')::uuid then raise exception 'FAIL: switch vrátil jinou domácnost'; end if;
  if (select count(*) from public.household_members where user_id = auth.uid()) <> 1 then
    raise exception 'FAIL: B není právě v jedné domácnosti';
  end if;
  if (select household_id from public.household_members where user_id = auth.uid()) <> v_res then
    raise exception 'FAIL: B není v domácnosti A';
  end if;
  if (select count(*) from public.stock_items) <> 1 then raise exception 'FAIL: B nevidí sklad A'; end if;
end $$;

-- stará domácnost B zmizela i s daty (kontrola bez RLS)
reset role;
do $$
begin
  if exists (select 1 from public.households where id = current_setting('test.hh_b')::uuid) then
    raise exception 'FAIL: domácnost B nebyla smazána';
  end if;
  if exists (select 1 from public.products where household_id = current_setting('test.hh_b')::uuid) then
    raise exception 'FAIL: data domácnosti B zůstala';
  end if;
end $$;
set local role authenticated;

-- ---------- A (admin, ne sám) přejde jinam → domácnost zůstane, B se stane správcem ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
declare v_hh_c uuid;
begin
  v_hh_c := public.create_household('Domácnost C', 'C', '#000000');
  perform set_config('test.token_c', public.create_invite(v_hh_c), true);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  perform public.switch_household(current_setting('test.token_c'), 'A', '#2563eb');
end $$;

reset role;
do $$
begin
  if not exists (select 1 from public.households where id = current_setting('test.hh_a')::uuid) then
    raise exception 'FAIL: domácnost A se smazala, i když v ní zůstala B';
  end if;
  if (select role from public.household_members where user_id = '00000000-0000-4000-8000-00000000000b') <> 'admin' then
    raise exception 'FAIL: po odchodu admina nikdo nepřevzal správu';
  end if;
end $$;

select 'Testy přechodu domácnosti a naplnění: OK' as vysledek;

rollback;
