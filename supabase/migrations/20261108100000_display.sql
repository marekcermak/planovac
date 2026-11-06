-- Fáze 6: Živý obraz (zivyobraz.eu) – hodnoty pro e-ink displej.
-- Vše běží v databázi: display_values() složí hodnoty, push_display() je pošle přes pg_net
-- (GET https://in.zivyobraz.eu/?import_key=…&nazev=hodnota…), pg_cron spouští každou minutu
-- (odešle, když se něco změnilo před ≥ 1 min, nebo nejpozději po 10 min).
-- Importní klíč se zadává v Nastavení → Živý obraz a klient ho nikdy nepřečte zpět.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Ruční připnutí na displej
-- ---------------------------------------------------------------------------

create table public.display_pins (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null default 'text' check (kind in ('task', 'journal', 'recipe', 'habit', 'stock', 'text')),
  ref_id        uuid,
  text          text not null check (char_length(btrim(text)) between 1 and 60),
  slot          smallint not null check (slot between 1 and 3),
  until_kind    text not null default 'end_of_day' check (until_kind in ('end_of_day', 'until_removed', 'date')),
  until_date    date,
  created_on    date not null default public.today_prague(),
  created_at    timestamptz not null default now(),
  unique (owner_id, slot),
  check (until_kind <> 'date' or until_date is not null)
);

revoke all on public.display_pins from anon, authenticated;
grant select, insert, update, delete on public.display_pins to authenticated;
alter table public.display_pins enable row level security;
-- Co je na displeji, vidí celá domácnost (displej visí doma); mění jen autor.
create policy display_pins_select on public.display_pins for select to authenticated
  using (public.is_household_member(household_id));
create policy display_pins_write on public.display_pins for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Konfigurace (klíč jen pro funkce v DB) + stav posledního odeslání
-- ---------------------------------------------------------------------------

create table public.display_config (
  household_id    uuid primary key references public.households (id) on delete cascade,
  import_key      text,
  dirty_at        timestamptz,
  last_push_at    timestamptz,
  last_request_id bigint
);
revoke all on public.display_config from anon, authenticated;
alter table public.display_config enable row level security;
-- Žádné policies: klient sem nesmí, jen security definer funkce níže.

-- Návyk lze poslat na displej (souhlas vlastníka, návyky jsou jinak soukromé).
-- habits.show_on_display už existuje (fáze 5b).

-- ---------------------------------------------------------------------------
-- Hodnoty
-- ---------------------------------------------------------------------------

-- „marek“, „marketa“ – jméno člena pro názvy hodnot (bez diakritiky, jen a–z0–9).
create function public.display_slug(p_name text)
returns text
language sql stable set search_path = ''
as $$
  select coalesce(nullif(regexp_replace(extensions.unaccent(lower(p_name)), '[^a-z0-9]', '', 'g'), ''), 'clen');
$$;

create function public.display_field_on(p_fields jsonb, p_name text, p_default boolean)
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce((p_fields ->> p_name)::boolean, p_default);
$$;

-- Složí hodnoty pro displej. Vypnutá pole posílá prázdná (aby displej nezobrazoval staré).
create function public._display_values(p_household_id uuid)
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

  -- Prochází (včetně prošlého), max 3 + „+N“.
  select array_agg(name order by exp), count(*) into v_names, v_count from (
    select p.name, i.expires_on as exp
    from public.stock_items i join public.products p on p.id = i.product_id
    where i.household_id = p_household_id and i.status = 'active' and i.expires_on is not null
      and i.expires_on <= v_today + coalesce(v_set.expiry_warn_days, 2)
  ) s;
  if public.display_field_on(v_fields, 'prochazi', true) then
    v_out := v_out || jsonb_build_object(
      'prochazi', coalesce(array_to_string(v_names[1:3], ', ') || case when v_count > 3 then ' +' || (v_count - 3) else '' end, ''),
      'prochazi_pocet', coalesce(v_count, 0)::text);
  else
    v_out := v_out || jsonb_build_object('prochazi', '', 'prochazi_pocet', '');
  end if;

  if public.display_field_on(v_fields, 'nakup', false) then
    v_out := v_out || jsonb_build_object('nakup_pocet',
      (select count(*) from public.shopping_items where household_id = p_household_id and not checked)::text);
  else
    v_out := v_out || jsonb_build_object('nakup_pocet', '');
  end if;

  for v_m in select user_id, display_name from public.household_members where household_id = p_household_id loop
    v_slug := public.display_slug(v_m.display_name);

    -- Návyky na dnešek (jen ty, které má vlastník povolené na displej).
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
    else
      v_out := v_out || jsonb_build_object(v_slug || '_navyky', '', v_slug || '_navyky_hotovo', '');
    end if;

    -- Top 3 (jen sdílené úkoly – soukromé na společný displej nepatří).
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
    else
      v_out := v_out || jsonb_build_object(v_slug || '_top3', '');
    end if;

    -- Připnuté (vždy zapnuto – posílá je člověk ručně).
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
revoke execute on function public._display_values(uuid) from public, anon, authenticated;

-- Odeslání (asynchronně přes pg_net). Smaže prošlé piny. Vrací false, když není klíč / je vypnuto.
create function public._push_display(p_household_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_key   text;
  v_req   bigint;
  v_today date := public.today_prague();
begin
  select import_key into v_key from public.display_config where household_id = p_household_id;
  if v_key is null or not exists (select 1 from public.settings where household_id = p_household_id and zivyobraz_enabled) then
    return false;
  end if;

  delete from public.display_pins
    where household_id = p_household_id
      and ((until_kind = 'end_of_day' and created_on < v_today) or (until_kind = 'date' and until_date < v_today));

  select net.http_get(
    url := 'https://in.zivyobraz.eu/',
    params := jsonb_build_object('import_key', v_key) || public._display_values(p_household_id),
    timeout_milliseconds := 10000
  ) into v_req;

  update public.display_config set last_push_at = now(), last_request_id = v_req, dirty_at = null
    where household_id = p_household_id;
  return true;
end;
$$;
revoke execute on function public._push_display(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC pro klienta
-- ---------------------------------------------------------------------------

-- Náhled hodnot (pro Nastavení; jen pro člena domácnosti).
create function public.display_preview(p_household_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'Nejsi členem domácnosti.' using errcode = '42501';
  end if;
  return public._display_values(p_household_id);
end;
$$;

-- Stav: je klíč, kdy se naposledy posílalo a s jakým výsledkem.
create function public.display_status(p_household_id uuid)
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
  if v_cfg.last_request_id is not null then
    select status_code, error_msg, left(content, 200) as content into v_res
      from net._http_response where id = v_cfg.last_request_id;
  end if;
  return jsonb_build_object(
    'has_key', v_cfg.import_key is not null,
    'last_push_at', v_cfg.last_push_at,
    'status_code', v_res.status_code,
    'error', coalesce(v_res.error_msg, case when v_res.status_code >= 400 then v_res.content end));
end;
$$;

-- Nastavit / smazat importní klíč (jen správce).
create function public.set_display_key(p_household_id uuid, p_key text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_household_admin(p_household_id) then
    raise exception 'Klíč může nastavit jen správce domácnosti.' using errcode = '42501';
  end if;
  if p_key is not null and (char_length(btrim(p_key)) not between 8 and 200 or btrim(p_key) ~ '\s') then
    raise exception 'Klíč nevypadá správně.' using errcode = '22023';
  end if;
  insert into public.display_config (household_id, import_key) values (p_household_id, nullif(btrim(p_key), ''))
    on conflict (household_id) do update set import_key = excluded.import_key;
end;
$$;

-- „Odeslat teď“ (každý člen; volá se i po připnutí).
create function public.push_display_now(p_household_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'Nejsi členem domácnosti.' using errcode = '42501';
  end if;
  return public._push_display(p_household_id);
end;
$$;

revoke execute on function public.display_preview(uuid), public.display_status(uuid), public.set_display_key(uuid, text),
  public.push_display_now(uuid) from public, anon;
grant execute on function public.display_preview(uuid), public.display_status(uuid), public.set_display_key(uuid, text),
  public.push_display_now(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Změny → „dirty“ (odešle se do ~1 min), plánovač každou minutu
-- ---------------------------------------------------------------------------

create function public._display_mark_dirty()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_hh uuid;
begin
  if tg_table_name = 'habit_logs' then
    select household_id into v_hh from public.habits where id = coalesce(new.habit_id, old.habit_id);
  else
    v_hh := coalesce(new.household_id, old.household_id);
  end if;
  if v_hh is not null then
    update public.display_config set dirty_at = coalesce(dirty_at, now())
      where household_id = v_hh and import_key is not null;
  end if;
  return null;
end;
$$;

create trigger display_dirty after insert or update or delete on public.stock_items
  for each row execute function public._display_mark_dirty();
create trigger display_dirty after insert or update or delete on public.tasks
  for each row execute function public._display_mark_dirty();
create trigger display_dirty after insert or update or delete on public.habit_logs
  for each row execute function public._display_mark_dirty();
create trigger display_dirty after insert or update or delete on public.shopping_items
  for each row execute function public._display_mark_dirty();
create trigger display_dirty after insert or update or delete on public.display_pins
  for each row execute function public._display_mark_dirty();

create function public.display_cron()
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
      and ((c.dirty_at is not null and c.dirty_at <= now() - interval '1 minute')
        or c.last_push_at is null
        or c.last_push_at <= now() - interval '10 minutes')
  loop
    perform public._push_display(v_hh);
  end loop;
end;
$$;
revoke execute on function public.display_cron() from public, anon, authenticated;

select cron.schedule('push-display', '* * * * *', 'select public.display_cron()');

alter publication supabase_realtime add table public.display_pins;
