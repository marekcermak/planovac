-- Testy fáze 4b (nákupní seznam, Uvařeno). Spouští se: npm run db:test
-- Běží v transakci s ROLLBACK. Chyba = výjimka „FAIL…“.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000004b1', 'test4b-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000004b2', 'test4b-c@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;

-- ---------- A: seznam, slučování, Uvařeno ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004b1","role":"authenticated"}', true);

do $$
declare
  v_hh uuid; v_ing uuid; v_n int; v_row public.shopping_items; v_prod uuid; v_item uuid; v_item2 uuid;
  v_recipe uuid; v_log uuid;
begin
  v_hh := public.create_household('Nákup test', 'A', '#2563eb');
  perform set_config('test.hh', v_hh::text, true);
  select id into v_ing from public.ingredients where household_id = v_hh and name = 'mléko';

  v_n := public.add_shopping_items(v_hh, jsonb_build_array(
    jsonb_build_object('text', 'mléko', 'ingredient_id', v_ing, 'quantity', 1, 'unit', 'l', 'source', 'recipe', 'recipe_title', 'Palačinky'),
    jsonb_build_object('text', 'chleba')));
  if v_n <> 2 then raise exception 'FAIL: přidáno % místo 2', v_n; end if;

  -- Stejná surovina, stejná jednotka → součet; jiný recept se připíše.
  v_n := public.add_shopping_items(v_hh, jsonb_build_array(
    jsonb_build_object('text', 'Mléko polotučné', 'ingredient_id', v_ing, 'quantity', 0.5, 'unit', 'l', 'recipe_title', 'Kaše')));
  if v_n <> 0 then raise exception 'FAIL: mléko se nesloučilo'; end if;
  select * into v_row from public.shopping_items where household_id = v_hh and ingredient_id = v_ing;
  if v_row.quantity <> 1.5 or v_row.recipe_titles <> array['Palačinky', 'Kaše'] then
    raise exception 'FAIL: sloučení mléka % %', v_row.quantity, v_row.recipe_titles;
  end if;

  -- Jiná jednotka → do poznámky.
  perform public.add_shopping_items(v_hh, jsonb_build_array(
    jsonb_build_object('text', 'mléko', 'ingredient_id', v_ing, 'quantity', 20, 'unit', 'ml')));
  select * into v_row from public.shopping_items where household_id = v_hh and ingredient_id = v_ing;
  if v_row.quantity <> 1.5 or v_row.note <> '20 ml' then raise exception 'FAIL: jiná jednotka: % / %', v_row.quantity, v_row.note; end if;

  -- Stejný text bez suroviny (velikost písmen) → sloučit; odškrtnutá položka se neslučuje.
  perform public.add_shopping_items(v_hh, '[{"text":"Chleba"}]');
  if (select count(*) from public.shopping_items where household_id = v_hh) <> 2 then raise exception 'FAIL: chleba dvakrát'; end if;
  update public.shopping_items set checked = true where household_id = v_hh and text = 'chleba';
  perform public.add_shopping_items(v_hh, '[{"text":"chleba"}]');
  if (select count(*) from public.shopping_items where household_id = v_hh) <> 3 then raise exception 'FAIL: odškrtnutý chleba sloučen'; end if;

  -- Uvařeno: dva kusy mléka, jeden částečně, druhý celý.
  insert into public.products (household_id, name, ingredient_id, default_unit) values (v_hh, 'Mléko', v_ing, 'l') returning id into v_prod;
  v_item  := public.add_stock(v_prod, null, 1, 'l', null, null);
  v_item2 := public.add_stock(v_prod, null, 1, 'l', null, null);
  insert into public.recipes (household_id, title, servings) values (v_hh, 'Palačinky', 4) returning id into v_recipe;
  perform set_config('test.recipe', v_recipe::text, true);
  perform set_config('test.item', v_item2::text, true);

  v_log := public.cook_recipe(v_recipe, 2, jsonb_build_array(
    jsonb_build_object('item_id', v_item, 'quantity', 0.25),
    jsonb_build_object('item_id', v_item2)));
  if (select quantity from public.stock_items where id = v_item) <> 0.75 then raise exception 'FAIL: částečný odečet'; end if;
  if (select status from public.stock_items where id = v_item2) <> 'consumed' then raise exception 'FAIL: celý kus nespotřebován'; end if;
  if (select servings from public.cook_log where id = v_log) <> 2 then raise exception 'FAIL: cook_log'; end if;
  if (select count(*) from public.stock_events where stock_item_id = v_item and type = 'consume' and note = 'Uvařeno: Palačinky') <> 1 then
    raise exception 'FAIL: událost odečtu';
  end if;

  -- Odečet kusu, který už není ve skladu → celé Uvařeno se vrátí.
  begin
    perform public.cook_recipe(v_recipe, null, jsonb_build_array(jsonb_build_object('item_id', v_item2)));
    raise exception 'FAIL: uvařeno ze spotřebovaného kusu';
  exception when sqlstate 'P0001' then null;
  end;
  if (select count(*) from public.cook_log where recipe_id = v_recipe) <> 1 then raise exception 'FAIL: cook_log po chybě'; end if;
end $$;

-- ---------- C: jiná domácnost ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004b2","role":"authenticated"}', true);

do $$
declare v_hh uuid := current_setting('test.hh')::uuid; v_own uuid; v_n int;
begin
  v_own := public.create_household('Cizí nákup', 'C', '#16a34a');

  select count(*) into v_n from public.shopping_items where household_id = v_hh;
  if v_n <> 0 then raise exception 'FAIL: C vidí cizí nákup'; end if;

  begin
    perform public.add_shopping_items(v_hh, '[{"text":"x"}]');
    raise exception 'FAIL: C přidal do cizího seznamu';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.shopping_items (household_id, text) values (v_hh, 'x');
    raise exception 'FAIL: C vložil do cizího seznamu';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.cook_recipe(current_setting('test.recipe')::uuid, null, '[]');
    raise exception 'FAIL: C uvařil cizí recept';
  exception when sqlstate 'P0002' then null;
  end;

  -- Cizí kus skladu přes vlastní recept.
  declare v_r uuid;
  begin
    insert into public.recipes (household_id, title) values (v_own, 'Můj') returning id into v_r;
    perform public.cook_recipe(v_r, null, jsonb_build_array(jsonb_build_object('item_id', current_setting('test.item'))));
    raise exception 'FAIL: C odečetl cizí sklad';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

rollback;
