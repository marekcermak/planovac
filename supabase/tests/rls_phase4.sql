-- RLS testy fáze 4a (kuchařka, suroviny, AI útrata). Spouští se: npm run db:test
-- Běží v transakci s ROLLBACK. Chyba = výjimka „FAIL…“.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-00000000004a', 'test4-a@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000004c', 'test4-c@example.invalid', 'authenticated', 'authenticated');

set local role authenticated;

-- ---------- A: výchozí suroviny a kapitoly, recept ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000004a","role":"authenticated"}', true);

do $$
declare v_hh uuid; v_recipe uuid; v_cat uuid; v_ing uuid;
begin
  v_hh := public.create_household('Kuchařka test', 'A', '#2563eb');
  perform set_config('test.hh', v_hh::text, true);

  if (select count(*) from public.ingredients where household_id = v_hh) < 150 then
    raise exception 'FAIL: chybí výchozí suroviny (%)', (select count(*) from public.ingredients where household_id = v_hh);
  end if;
  if not exists (select 1 from public.ingredient_aliases a join public.ingredients i on i.id = a.ingredient_id
                 where i.household_id = v_hh and i.name = 'vejce' and a.alias = 'vajíčko') then
    raise exception 'FAIL: chybí alias vajíčko';
  end if;
  if (select count(*) from public.recipe_categories where household_id = v_hh) <> 12 then
    raise exception 'FAIL: chybí výchozí kapitoly';
  end if;

  select id into v_cat from public.recipe_categories where household_id = v_hh and name = 'Těstoviny';
  select id into v_ing from public.ingredients where household_id = v_hh and name = 'hladká mouka';

  insert into public.recipes (household_id, title, servings, steps)
    values (v_hh, 'Palačinky', 4, 'Smíchat.') returning id into v_recipe;
  perform set_config('test.recipe', v_recipe::text, true);
  insert into public.recipe_category_links (household_id, recipe_id, category_id) values (v_hh, v_recipe, v_cat);
  insert into public.recipe_ingredients (household_id, recipe_id, name, ingredient_id, quantity, unit)
    values (v_hh, v_recipe, 'hladká mouka', v_ing, 200, 'g');

  -- Produkt se surovinou z vlastní domácnosti.
  insert into public.products (household_id, name, ingredient_id) values (v_hh, 'Mouka Babiččina volba', v_ing);

  -- AI útratu klient zapisovat nesmí.
  begin
    insert into public.ai_usage (household_id, feature, model) values (v_hh, 'x', 'y');
    raise exception 'FAIL: klient zapsal ai_usage';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- C: jiná domácnost ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000004c","role":"authenticated"}', true);

do $$
declare v_hh uuid := current_setting('test.hh')::uuid; v_own uuid; v_n int;
begin
  v_own := public.create_household('Cizí kuchyně', 'C', '#16a34a');

  if (select count(*) from public.recipes where household_id = v_hh) <> 0 then raise exception 'FAIL: C vidí cizí recepty'; end if;
  if (select count(*) from public.recipe_ingredients where household_id = v_hh) <> 0 then raise exception 'FAIL: C vidí cizí suroviny receptu'; end if;
  if (select count(*) from public.recipe_category_links where household_id = v_hh) <> 0 then raise exception 'FAIL: C vidí cizí zařazení'; end if;
  if (select count(*) from public.ingredients where household_id = v_hh) <> 0 then raise exception 'FAIL: C vidí cizí suroviny'; end if;
  if (select count(*) from public.recipe_categories where household_id = v_hh) <> 0 then raise exception 'FAIL: C vidí cizí kapitoly'; end if;

  update public.recipes set title = 'hack' where household_id = v_hh;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: C upravil cizí recept'; end if;

  begin
    insert into public.recipe_ingredients (household_id, recipe_id, name)
      values (v_hh, current_setting('test.recipe')::uuid, 'hack');
    raise exception 'FAIL: C přidal surovinu do cizího receptu';
  exception when insufficient_privilege then null;
  end;

  -- Vlastní surovina receptu nesmí ukazovat na cizí recept (složený FK).
  begin
    insert into public.recipe_ingredients (household_id, recipe_id, name)
      values (v_own, current_setting('test.recipe')::uuid, 'hack');
    raise exception 'FAIL: odkaz na cizí recept prošel';
  exception when foreign_key_violation then null;
  end;

  -- Storage: cesta do cizí domácnosti neprojde politikou.
  if public.storage_household_member(v_hh::text || '/x/y.jpg') then raise exception 'FAIL: storage cizí domácnost'; end if;
  if not public.storage_household_member(v_own::text || '/x/y.jpg') then raise exception 'FAIL: storage vlastní domácnost'; end if;
  if public.storage_household_member('neni-uuid/y.jpg') then raise exception 'FAIL: storage neplatná cesta'; end if;
end $$;

select 'OK: všechny testy fáze 4a prošly' as vysledek;

rollback;
