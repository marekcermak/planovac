-- Fáze 4b: nákupní seznam, „Uvařeno“ (odečet ze skladu + cook_log).

-- ---------------------------------------------------------------------------
-- Nákupní seznam (sdílený v domácnosti, realtime)
-- ---------------------------------------------------------------------------

create table public.shopping_items (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  text           text not null check (char_length(btrim(text)) between 1 and 120),
  ingredient_id  uuid,
  product_id     uuid,
  quantity       numeric(10, 3) check (quantity > 0),
  unit           text check (char_length(unit) <= 20),
  note           text check (char_length(note) <= 300),
  -- Pro které recepty (jen pro zobrazení, „na Palačinky, Guláš“).
  recipe_titles  text[] not null default '{}',
  source         text not null default 'manual' check (source in ('manual', 'recipe', 'stock')),
  checked        boolean not null default false,
  checked_at     timestamptz,
  checked_by     uuid references auth.users (id) on delete set null,
  added_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  foreign key (ingredient_id, household_id) references public.ingredients (id, household_id)
    on delete set null (ingredient_id),
  foreign key (product_id, household_id) references public.products (id, household_id)
    on delete set null (product_id)
);
create index shopping_items_household_idx on public.shopping_items (household_id, checked, created_at);

revoke all on public.shopping_items from anon, authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;
alter table public.shopping_items enable row level security;
create policy shopping_items_member on public.shopping_items for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

-- Přidá položky na seznam. Stejnou surovinu / produkt / text, která na seznamu už je
-- (neodškrtnutá), nepřidá znovu, ale sečte množství (stejná jednotka) nebo připíše do poznámky.
-- p_items: [{text, ingredient_id?, product_id?, quantity?, unit?, source?, recipe_title?}]
-- Vrací počet nově založených položek (zbytek byl sloučen).
create function public.add_shopping_items(p_household_id uuid, p_items jsonb)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_it     jsonb;
  v_text   text;
  v_ing    uuid;
  v_prod   uuid;
  v_qty    numeric;
  v_unit   text;
  v_source text;
  v_title  text;
  v_row    public.shopping_items;
  v_new    int := 0;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'Nejsi členem domácnosti.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Neplatný seznam.' using errcode = '22023';
  end if;

  for v_it in select * from jsonb_array_elements(p_items) loop
    v_text   := btrim(coalesce(v_it ->> 'text', ''));
    v_ing    := nullif(v_it ->> 'ingredient_id', '')::uuid;
    v_prod   := nullif(v_it ->> 'product_id', '')::uuid;
    v_qty    := nullif(v_it ->> 'quantity', '')::numeric;
    v_unit   := nullif(btrim(coalesce(v_it ->> 'unit', '')), '');
    v_source := coalesce(nullif(v_it ->> 'source', ''), 'manual');
    v_title  := nullif(btrim(coalesce(v_it ->> 'recipe_title', '')), '');
    if v_text = '' then continue; end if;
    if v_qty is not null and v_qty <= 0 then v_qty := null; end if;

    select * into v_row from public.shopping_items s
      where s.household_id = p_household_id and not s.checked
        and ((v_ing is not null and s.ingredient_id = v_ing)
          or (v_prod is not null and s.product_id = v_prod)
          or lower(s.text) = lower(v_text))
      order by s.created_at
      limit 1
      for update;

    if found then
      if v_qty is not null then
        if v_row.quantity is not null and v_row.unit is not distinct from v_unit then
          v_row.quantity := v_row.quantity + v_qty;
        elsif v_row.quantity is null and v_row.unit is null then
          v_row.quantity := v_qty;
          v_row.unit := v_unit;
        else
          v_row.note := left(concat_ws(' + ', v_row.note, replace(case when v_qty = trunc(v_qty) then trunc(v_qty)::text else rtrim(v_qty::text, '0') end, '.', ',') || coalesce(' ' || v_unit, '')), 300);
        end if;
      end if;
      if v_title is not null and not (v_title = any (v_row.recipe_titles)) then
        v_row.recipe_titles := v_row.recipe_titles || v_title;
      end if;
      update public.shopping_items
        set quantity = v_row.quantity, unit = v_row.unit, note = v_row.note, recipe_titles = v_row.recipe_titles,
            ingredient_id = coalesce(ingredient_id, v_ing), product_id = coalesce(product_id, v_prod)
        where id = v_row.id;
    else
      insert into public.shopping_items (household_id, text, ingredient_id, product_id, quantity, unit, source, recipe_titles)
        values (p_household_id, left(v_text, 120), v_ing, v_prod, v_qty, v_unit,
                case when v_source in ('manual', 'recipe', 'stock') then v_source else 'manual' end,
                case when v_title is null then '{}'::text[] else array[v_title] end);
      v_new := v_new + 1;
    end if;
  end loop;
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Uvařeno: odečte vybrané kusy ze skladu a zapíše cook_log (vše v jedné transakci).
-- p_takes: [{item_id, quantity?}] – quantity null = spotřebovat celý kus.
-- ---------------------------------------------------------------------------

create function public.cook_recipe(p_recipe_id uuid, p_servings int default null, p_takes jsonb default '[]')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_recipe public.recipes;
  v_take   jsonb;
  v_id     uuid;
begin
  select * into v_recipe from public.recipes where id = p_recipe_id;
  if not found or not public.is_household_member(v_recipe.household_id) then
    raise exception 'Recept neexistuje.' using errcode = 'P0002';
  end if;

  for v_take in select * from jsonb_array_elements(coalesce(p_takes, '[]'::jsonb)) loop
    -- take_stock sám ověří, že kus patří do domácnosti a je ve skladu.
    if (select household_id from public.stock_items where id = (v_take ->> 'item_id')::uuid) is distinct from v_recipe.household_id then
      raise exception 'Položka neexistuje.' using errcode = 'P0002';
    end if;
    perform public.take_stock((v_take ->> 'item_id')::uuid, 'consume',
                              nullif(v_take ->> 'quantity', '')::numeric, left('Uvařeno: ' || v_recipe.title, 200));
  end loop;

  insert into public.cook_log (household_id, recipe_id, servings)
    values (v_recipe.household_id, v_recipe.id, case when p_servings between 1 and 100 then p_servings end)
    returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.add_shopping_items(uuid, jsonb) from public, anon;
revoke execute on function public.cook_recipe(uuid, int, jsonb)   from public, anon;
grant execute on function public.add_shopping_items(uuid, jsonb) to authenticated;
grant execute on function public.cook_recipe(uuid, int, jsonb)   to authenticated;

alter publication supabase_realtime add table public.shopping_items, public.cook_log;
