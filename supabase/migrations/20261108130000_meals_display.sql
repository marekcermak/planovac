-- Změna zadání (2026-11-08):
-- 1) Jídelníček – jedno jídlo na den (text nebo recept z kuchařky), sdílený v domácnosti.
-- 2) Displej: jídlo (dnes / zítra / týden) a společné úkoly (dnes / tento týden) místo návyků a Top 3 po lidech.
--    Návyky se na displej neposílají vůbec.
-- 3) Úkoly jsou ve výchozím stavu soukromé; společné se zapínají ručně.

alter table public.tasks alter column visibility set default 'private';

-- ---------------------------------------------------------------------------
-- Jídelníček
-- ---------------------------------------------------------------------------

create table public.meal_plan (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  date          date not null,
  text          text not null check (char_length(btrim(text)) between 1 and 80),
  recipe_id     uuid,
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (household_id, date),
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete set null (recipe_id)
);

revoke all on public.meal_plan from anon, authenticated;
grant select, insert, update, delete on public.meal_plan to authenticated;
alter table public.meal_plan enable row level security;
create policy meal_plan_member on public.meal_plan for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

create trigger display_dirty after insert or update or delete on public.meal_plan
  for each row execute function public._display_mark_dirty();

alter publication supabase_realtime add table public.meal_plan;

-- ---------------------------------------------------------------------------
-- Hodnoty pro displej (nová sada)
-- ---------------------------------------------------------------------------

-- „Vynést koš, Uklidit +2“
create function public._display_list(p_items text[], p_max int default 3)
returns text
language sql immutable set search_path = ''
as $$
  select coalesce(array_to_string(p_items[1:p_max], ', ')
    || case when cardinality(p_items) > p_max then ' +' || (cardinality(p_items) - p_max) else '' end, '');
$$;

create or replace function public._display_values(p_household_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today   date := public.today_prague();
  v_dow     int := extract(isodow from public.today_prague())::int;
  v_sunday  date := public.today_prague() + (7 - extract(isodow from public.today_prague())::int);
  v_set     public.settings;
  v_fields  jsonb;
  v_out     jsonb := '{}'::jsonb;
  v_m       record;
  v_slug    text;
  v_names   text[];
  v_txt     text;
  v_pins    text[];
  v_days    text[] := array['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
begin
  select * into v_set from public.settings where household_id = p_household_id;
  v_fields := coalesce(v_set.display_fields, '{}'::jsonb);

  v_out := v_out || jsonb_build_object(
    'datum', v_days[v_dow] || ' ' || extract(day from v_today)::int || '. ' || extract(month from v_today)::int || '.',
    'aktualizace', to_char(now() at time zone 'Europe/Prague', 'HH24:MI'));

  -- Jídlo: dnes, zítra, a týden dopředu („út kuře · st rizoto“).
  if public.display_field_on(v_fields, 'jidlo', true) then
    select string_agg(v_days[extract(isodow from date)::int] || ' ' || text, ' · ' order by date) into v_txt
      from public.meal_plan where household_id = p_household_id and date between v_today and v_today + 6;
    v_out := v_out || jsonb_build_object(
      'jidlo_dnes', coalesce((select text from public.meal_plan where household_id = p_household_id and date = v_today), ''),
      'jidlo_zitra', coalesce((select text from public.meal_plan where household_id = p_household_id and date = v_today + 1), ''),
      'jidlo_tyden', coalesce(v_txt, ''));
  end if;

  -- Společné úkoly (soukromé nikdy): dnes = termín dnes / po termínu / hvězdička na dnes, týden = do neděle.
  if public.display_field_on(v_fields, 'ukoly', true) then
    select array_agg(title order by priority desc, due_date nulls last, created_at) into v_names
      from public.tasks
      where household_id = p_household_id and visibility = 'shared' and done_at is null
        and (due_date <= v_today or top3_on = v_today);
    v_out := v_out || jsonb_build_object('ukoly_dnes', public._display_list(v_names, 4));
    select array_agg(title order by due_date, priority desc, created_at) into v_names
      from public.tasks
      where household_id = p_household_id and visibility = 'shared' and done_at is null
        and due_date > v_today and due_date <= v_sunday
        and top3_on is distinct from v_today;
    v_out := v_out || jsonb_build_object('ukoly_tyden', public._display_list(v_names, 4));
  end if;

  if public.display_field_on(v_fields, 'prochazi', true) then
    select array_agg(p.name order by i.expires_on) into v_names
      from public.stock_items i join public.products p on p.id = i.product_id
      where i.household_id = p_household_id and i.status = 'active' and i.expires_on is not null
        and i.expires_on <= v_today + coalesce(v_set.expiry_warn_days, 2);
    v_out := v_out || jsonb_build_object(
      'prochazi', public._display_list(v_names, 3),
      'prochazi_pocet', coalesce(cardinality(v_names), 0)::text);
  end if;

  if public.display_field_on(v_fields, 'nakup', false) then
    v_out := v_out || jsonb_build_object('nakup_pocet',
      (select count(*) from public.shopping_items where household_id = p_household_id and not checked)::text);
  end if;

  -- Po lidech jen ručně připnuté položky.
  for v_m in select user_id, display_name from public.household_members where household_id = p_household_id loop
    v_slug := public.display_slug(v_m.display_name);
    select array_agg(text order by slot) into v_pins from public.display_pins p
      where p.owner_id = v_m.user_id and p.household_id = p_household_id
        and (p.until_kind = 'until_removed'
          or (p.until_kind = 'end_of_day' and p.created_on >= v_today)
          or (p.until_kind = 'date' and p.until_date >= v_today));
    v_out := v_out || jsonb_build_object(
      v_slug || '_pripnuto_1', coalesce(v_pins[1], ''),
      v_slug || '_pripnuto_2', coalesce(v_pins[2], ''),
      v_slug || '_pripnuto_3', coalesce(v_pins[3], ''),
      v_slug || '_pripnuto', coalesce(array_to_string(v_pins, ' · '), ''));
  end loop;

  return v_out;
end;
$$;

-- Odeslání po částech: společné hodnoty (max 10) + jeden požadavek na člena (4 hodnoty).
create or replace function public._push_display(p_household_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_key    text;
  v_values jsonb;
  v_part   jsonb;
  v_slug   text;
  v_slugs  text[];
  v_ids    bigint[] := '{}';
  v_req    bigint;
  v_today  date := public.today_prague();
begin
  select import_key into v_key from public.display_config where household_id = p_household_id;
  if v_key is null or not exists (select 1 from public.settings where household_id = p_household_id and zivyobraz_enabled) then
    return false;
  end if;

  delete from public.display_pins
    where household_id = p_household_id
      and ((until_kind = 'end_of_day' and created_on < v_today) or (until_kind = 'date' and until_date < v_today));

  v_values := public._display_values(p_household_id);
  select array_agg(distinct public.display_slug(display_name)) into v_slugs
    from public.household_members where household_id = p_household_id;

  select coalesce(jsonb_object_agg(k, v), '{}') into v_part from jsonb_each(v_values) as e(k, v)
    where not exists (select 1 from unnest(v_slugs) s where starts_with(k, s || '_'));
  select net.http_get(url := 'https://in.zivyobraz.eu/', params := jsonb_build_object('import_key', v_key) || v_part,
                      timeout_milliseconds := 10000) into v_req;
  v_ids := v_ids || v_req;

  foreach v_slug in array coalesce(v_slugs, '{}') loop
    select coalesce(jsonb_object_agg(k, v), '{}') into v_part from jsonb_each(v_values) as e(k, v)
      where starts_with(k, v_slug || '_');
    if v_part <> '{}'::jsonb then
      select net.http_get(url := 'https://in.zivyobraz.eu/', params := jsonb_build_object('import_key', v_key) || v_part,
                          timeout_milliseconds := 10000) into v_req;
      v_ids := v_ids || v_req;
    end if;
  end loop;

  update public.display_config
    set last_push_at = now(), last_request_id = v_ids[1], last_request_ids = v_ids, dirty_at = null
    where household_id = p_household_id;
  return true;
end;
$$;

-- Návyky už displej nezajímají.
drop trigger display_dirty on public.habit_logs;
