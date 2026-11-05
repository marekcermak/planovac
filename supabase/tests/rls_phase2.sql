-- RLS a RPC testy fáze 2 (sklad). Spouští se: npm run db:test
-- Vše běží v transakci a na konci se vrací (ROLLBACK). Chyba = výjimka „FAIL…“.
--
-- A a B jsou v jedné domácnosti, C má vlastní domácnost.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000002a', 'test2-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000002b', 'test2-b@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000002c', 'test2-c@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;

-- ---------- A: domácnost s výchozími daty, produkt, přidání do skladu ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000002a","role":"authenticated"}', true);

do $$
declare
  v_hh uuid; v_cat uuid; v_loc uuid; v_loc2 uuid; v_prod uuid; v_item uuid; v_row public.stock_items;
begin
  v_hh := public.create_household('Sklad test', 'A', '#2563eb');
  perform set_config('test.hh', v_hh::text, true);
  perform set_config('test.token', public.create_invite(v_hh), true);

  if (select count(*) from public.zones where household_id = v_hh) <> 3 then
    raise exception 'FAIL: nová domácnost nemá 3 výchozí zóny';
  end if;
  if (select count(*) from public.categories where household_id = v_hh) < 20 then
    raise exception 'FAIL: nová domácnost nemá výchozí kategorie';
  end if;

  select id into v_cat from public.categories where household_id = v_hh and name = 'Jogurty a tvaroh';
  select l.id into v_loc from public.locations l join public.zones z on z.id = l.zone_id
    where z.household_id = v_hh and l.label = 'Police 2';
  select l.id into v_loc2 from public.locations l join public.zones z on z.id = l.zone_id
    where z.household_id = v_hh and l.label = 'Police 3';
  perform set_config('test.loc2', v_loc2::text, true);

  insert into public.products (household_id, name, category_id, default_location_id, is_quick_add)
    values (v_hh, 'Jogurt bílý', v_cat, v_loc, true) returning id into v_prod;
  perform set_config('test.prod', v_prod::text, true);

  -- Odhad expirace z kategorie (14 dní), výchozí místo z produktu.
  v_item := public.add_stock(v_prod, p_quantity => 3, p_purchased_on => date '2026-01-10');
  perform set_config('test.item', v_item::text, true);
  select * into v_row from public.stock_items where id = v_item;
  if v_row.expires_on <> date '2026-01-24' or v_row.expiry_source <> 'estimated' then
    raise exception 'FAIL: odhad expirace % / %', v_row.expires_on, v_row.expiry_source;
  end if;
  if v_row.location_id <> v_loc then raise exception 'FAIL: nepoužilo se výchozí místo produktu'; end if;

  -- Datum z obalu.
  if (select expiry_source from public.stock_items
      where id = public.add_stock(v_prod, p_expires_on => date '2030-01-01')) <> 'label' then
    raise exception 'FAIL: datum z obalu nemá expiry_source = label';
  end if;

  -- Přímý zápis do skladu mimo RPC je zakázaný.
  begin
    insert into public.stock_items (household_id, product_id, quantity, unit) values (v_hh, v_prod, 1, 'ks');
    raise exception 'FAIL: přímý insert do stock_items prošel';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- B se přidá a pracuje se stejnými zásobami ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000002b","role":"authenticated"}', true);

do $$
declare
  v_item uuid := current_setting('test.item')::uuid;
  v_row  public.stock_items;
begin
  perform public.accept_invite(current_setting('test.token'), 'B', '#db2777');

  if (select count(*) from public.stock_items where status = 'active') <> 2 then
    raise exception 'FAIL: B nevidí zásoby domácnosti';
  end if;

  -- Částečně snědeno: 3 → 2, stále aktivní.
  perform public.take_stock(v_item, 'consume', 1);
  select * into v_row from public.stock_items where id = v_item;
  if v_row.quantity <> 2 or v_row.status <> 'active' then raise exception 'FAIL: částečná spotřeba'; end if;

  -- Otevřeno: expirace = min(2026-01-24, dnes + 3) => původní (minulost) zůstává.
  perform public.open_stock(v_item);
  select * into v_row from public.stock_items where id = v_item;
  if v_row.opened_on <> public.today_prague() or v_row.expires_on <> date '2026-01-24' then
    raise exception 'FAIL: otevření % / %', v_row.opened_on, v_row.expires_on;
  end if;

  perform public.move_stock(v_item, current_setting('test.loc2')::uuid);
  if (select location_id from public.stock_items where id = v_item) <> current_setting('test.loc2')::uuid then
    raise exception 'FAIL: přesun';
  end if;

  -- Vyhozeno celé.
  perform public.take_stock(v_item, 'waste');
  select * into v_row from public.stock_items where id = v_item;
  if v_row.status <> 'wasted' or v_row.quantity <> 0 then raise exception 'FAIL: vyhození'; end if;

  if (select array_agg(type order by id) from public.stock_events where stock_item_id = v_item)
     <> array['add', 'consume', 'open', 'move', 'waste'] then
    raise exception 'FAIL: události %', (select array_agg(type order by id) from public.stock_events where stock_item_id = v_item);
  end if;

  begin
    perform public.take_stock(v_item, 'consume');
    raise exception 'FAIL: akce nad vyhozenou položkou prošla';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- ---------- Otevření zkrátí expiraci v budoucnosti ----------
do $$
declare v_item uuid;
begin
  v_item := public.add_stock(current_setting('test.prod')::uuid, p_expires_on => public.today_prague() + 30);
  perform public.open_stock(v_item);
  if (select expires_on from public.stock_items where id = v_item) <> public.today_prague() + 3 then
    raise exception 'FAIL: otevření nezkrátilo expiraci';
  end if;
end $$;

-- ---------- C (jiná domácnost) nevidí a nemění nic ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000002c","role":"authenticated"}', true);

do $$
declare
  v_hh    uuid := current_setting('test.hh')::uuid;
  v_own   uuid;
  v_ownprod uuid;
  v_n     int;
begin
  v_own := public.create_household('Cizí', 'C', '#16a34a');

  if (select count(*) from public.zones where household_id = v_hh) <> 0 then raise exception 'FAIL: C vidí cizí zóny'; end if;
  if (select count(*) from public.locations where household_id = v_hh) <> 0 then raise exception 'FAIL: C vidí cizí lokace'; end if;
  if (select count(*) from public.categories where household_id = v_hh) <> 0 then raise exception 'FAIL: C vidí cizí kategorie'; end if;
  if (select count(*) from public.products where household_id = v_hh) <> 0 then raise exception 'FAIL: C vidí cizí produkty'; end if;
  if (select count(*) from public.stock_items where household_id = v_hh) <> 0 then raise exception 'FAIL: C vidí cizí zásoby'; end if;
  if (select count(*) from public.stock_events where household_id = v_hh) <> 0 then raise exception 'FAIL: C vidí cizí události'; end if;

  update public.products set name = 'hack' where household_id = v_hh;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: C upravil cizí produkt'; end if;

  begin
    insert into public.zones (household_id, name) values (v_hh, 'hack');
    raise exception 'FAIL: C vložil zónu do cizí domácnosti';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.add_stock(current_setting('test.prod')::uuid);
    raise exception 'FAIL: C přidal do cizího skladu';
  exception when sqlstate 'P0002' then null;
  end;

  begin
    perform public.take_stock(
      (select id from public.stock_items limit 1), 'consume');  -- C žádné nevidí => null
    raise exception 'FAIL: take_stock bez položky prošel';
  exception when sqlstate 'P0002' then null;
  end;

  -- Vlastní produkt nesmí ukazovat na lokaci cizí domácnosti (id známe z A; složený cizí klíč).
  begin
    insert into public.products (household_id, name, default_location_id)
      values (v_own, 'Křížový', current_setting('test.loc2')::uuid);
    raise exception 'FAIL: produkt odkazuje na lokaci cizí domácnosti';
  exception when foreign_key_violation then null;
  end;

  -- Ani přesun vlastní položky do cizí lokace.
  insert into public.products (household_id, name) values (v_own, 'Vlastní') returning id into v_ownprod;
  begin
    perform public.move_stock(public.add_stock(v_ownprod), current_setting('test.loc2')::uuid);
    raise exception 'FAIL: přesun do cizí lokace prošel';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

select 'OK: všechny testy fáze 2 prošly' as vysledek;

rollback;
