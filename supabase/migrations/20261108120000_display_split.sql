-- Živý obraz – úprava podle dokumentace (zivyobraz.eu/docs/cs/webovy-portal/hodnoty):
-- „Hodnoty posílejte nejdříve po minutě“ a víc než ~15 hodnot najednou dělá potíže.
-- 1) vypnutá pole se neposílají vůbec, 2) odeslání se dělí: společné hodnoty + jeden požadavek na člena,
-- 3) „Odeslat teď“ nejdřív minutu po posledním odeslání (jinak jen označí změnu a pošle cron).

alter table public.display_config add column last_request_ids bigint[] not null default '{}';

create or replace function public._display_values(p_household_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today   date := public.today_prague();
  v_dow     int := extract(isodow from public.today_prague())::int;
  v_week    date := public.today_prague() - (extract(isodow from public.today_prague())::int - 1);
  v_set     public.settings;
  v_fields  jsonb;
  v_out     jsonb := '{}'::jsonb;
  v_m       record;
  v_slug    text;
  v_names   text[];
  v_count   int;
  v_txt     text;
  v_done    int;
  v_total   int;
  v_pins    text[];
  v_days    text[] := array['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
begin
  select * into v_set from public.settings where household_id = p_household_id;
  v_fields := coalesce(v_set.display_fields, '{}'::jsonb);

  v_out := v_out || jsonb_build_object(
    'datum', v_days[v_dow] || ' ' || extract(day from v_today)::int || '. ' || extract(month from v_today)::int || '.',
    'aktualizace', to_char(now() at time zone 'Europe/Prague', 'HH24:MI'));

  if public.display_field_on(v_fields, 'prochazi', true) then
    select array_agg(name order by exp), count(*) into v_names, v_count from (
      select p.name, i.expires_on as exp
      from public.stock_items i join public.products p on p.id = i.product_id
      where i.household_id = p_household_id and i.status = 'active' and i.expires_on is not null
        and i.expires_on <= v_today + coalesce(v_set.expiry_warn_days, 2)
    ) s;
    v_out := v_out || jsonb_build_object(
      'prochazi', coalesce(array_to_string(v_names[1:3], ', ') || case when v_count > 3 then ' +' || (v_count - 3) else '' end, ''),
      'prochazi_pocet', coalesce(v_count, 0)::text);
  end if;

  if public.display_field_on(v_fields, 'nakup', false) then
    v_out := v_out || jsonb_build_object('nakup_pocet',
      (select count(*) from public.shopping_items where household_id = p_household_id and not checked)::text);
  end if;

  for v_m in select user_id, display_name from public.household_members where household_id = p_household_id loop
    v_slug := public.display_slug(v_m.display_name);

    if public.display_field_on(v_fields, 'navyky', false) then
      select string_agg(case when done then '✓ ' else '○ ' end || name, '  ' order by sort, name),
             count(*) filter (where done), count(*)
        into v_txt, v_done, v_total
      from (
        select h.name, h.sort,
          case when h.schedule = 'per_week'
            then exists (select 1 from public.habit_logs l where l.habit_id = h.id and l.date = v_today)
              or (select count(distinct l.date) from public.habit_logs l where l.habit_id = h.id and l.date between v_week and v_week + 6) >= h.per_week
            else exists (select 1 from public.habit_logs l where l.habit_id = h.id and l.date = v_today)
          end as done
        from public.habits h
        where h.owner_id = v_m.user_id and h.household_id = p_household_id and not h.archived and h.show_on_display
          and (h.schedule <> 'days' or v_dow = any (h.days))
      ) x;
      v_out := v_out || jsonb_build_object(
        v_slug || '_navyky', coalesce(v_txt, ''),
        v_slug || '_navyky_hotovo', case when v_total > 0 then v_done || '/' || v_total else '' end);
    end if;

    if public.display_field_on(v_fields, 'top3', false) then
      select string_agg(title, ' · ' order by rk) into v_txt from (
        select t.title, row_number() over (
          order by (t.top3_on = v_today) desc nulls last, t.priority desc, t.due_date nulls last, t.created_at) as rk
        from public.tasks t
        where t.household_id = p_household_id and t.visibility = 'shared' and t.done_at is null
          and (t.assignee_id = v_m.user_id or t.assignee_id is null)
          and (t.top3_on = v_today or t.due_date <= v_today)
      ) x where rk <= 3;
      v_out := v_out || jsonb_build_object(v_slug || '_top3', coalesce(v_txt, ''));
    end if;

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

create or replace function public._push_display(p_household_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_key    text;
  v_values jsonb;
  v_part   jsonb;
  v_slug   text;
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

  -- Společné hodnoty (max 5).
  select coalesce(jsonb_object_agg(k, v), '{}') into v_part from jsonb_each(v_values) as e(k, v)
    where k in ('datum', 'aktualizace', 'prochazi', 'prochazi_pocet', 'nakup_pocet');
  select net.http_get(url := 'https://in.zivyobraz.eu/', params := jsonb_build_object('import_key', v_key) || v_part,
                      timeout_milliseconds := 10000) into v_req;
  v_ids := v_ids || v_req;

  -- Jeden požadavek na člena (max 8 hodnot).
  for v_slug in select distinct public.display_slug(display_name) from public.household_members where household_id = p_household_id loop
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

-- „Odeslat teď“: nejdřív minutu po posledním odeslání, jinak označit změnu (pošle cron do minuty).
create or replace function public.push_display_now(p_household_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_last timestamptz;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'Nejsi členem domácnosti.' using errcode = '42501';
  end if;
  select last_push_at into v_last from public.display_config where household_id = p_household_id;
  if v_last is not null and v_last > now() - interval '1 minute' then
    update public.display_config set dirty_at = coalesce(dirty_at, now() - interval '1 minute') where household_id = p_household_id;
    return exists (select 1 from public.display_config c join public.settings s using (household_id)
                   where c.household_id = p_household_id and c.import_key is not null and s.zivyobraz_enabled);
  end if;
  return public._push_display(p_household_id);
end;
$$;

-- Cron: změna nejdřív minutu po posledním odeslání (limit zivyobraz.eu), jinak každých 10 minut.
create or replace function public.display_cron()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hh uuid;
begin
  for v_hh in
    select c.household_id from public.display_config c
    join public.settings s on s.household_id = c.household_id and s.zivyobraz_enabled
    where c.import_key is not null
      and (c.last_push_at is null
        or c.last_push_at <= now() - interval '10 minutes'
        or (c.dirty_at is not null and c.dirty_at <= now() - interval '1 minute' and c.last_push_at <= now() - interval '1 minute'))
  loop
    perform public._push_display(v_hh);
  end loop;
end;
$$;

-- Stav: nejhorší odpověď ze všech požadavků posledního odeslání.
create or replace function public.display_status(p_household_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cfg public.display_config;
  v_res record;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'Nejsi členem domácnosti.' using errcode = '42501';
  end if;
  select * into v_cfg from public.display_config where household_id = p_household_id;
  if cardinality(v_cfg.last_request_ids) > 0 then
    select status_code, error_msg, left(content, 200) as content into v_res
      from net._http_response where id = any (v_cfg.last_request_ids)
      order by (error_msg is not null) desc, coalesce(status_code, 0) desc
      limit 1;
  end if;
  return jsonb_build_object(
    'has_key', v_cfg.import_key is not null,
    'last_push_at', v_cfg.last_push_at,
    'status_code', v_res.status_code,
    'error', coalesce(v_res.error_msg, case when v_res.status_code >= 400 then v_res.content end));
end;
$$;
