-- Fáze 2: sklad – zóny a mřížky, lokace, kategorie, produkty, zásoby, události.
--
-- Zóny, lokace, kategorie a produkty upravují členové přímo (RLS).
-- Zásoby (stock_items) a události (stock_events) se mění jen přes RPC funkce níže,
-- aby každá změna atomicky zapsala i událost (zdroj pro statistiky).
-- Datumy jsou typu date a „dnes“ se počítá v Europe/Prague.
--
-- Složené cizí klíče (id, household_id) brání odkazu na řádek z cizí domácnosti.

-- ---------------------------------------------------------------------------
-- Pomocné
-- ---------------------------------------------------------------------------

create function public.today_prague()
returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'Europe/Prague')::date $$;

-- ---------------------------------------------------------------------------
-- Tabulky
-- ---------------------------------------------------------------------------

create table public.zones (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  type          text not null default 'other' check (type in ('fridge', 'freezer', 'pantry', 'other')),
  grid_rows     int  not null default 4 check (grid_rows between 1 and 12),
  grid_cols     int  not null default 2 check (grid_cols between 1 and 8),
  sort          int  not null default 0,
  created_at    timestamptz not null default now(),
  unique (id, household_id)
);
create index zones_household_idx on public.zones (household_id, sort);

-- Lokace = obdélník buněk v mřížce zóny (0-indexované řádky a sloupce).
create table public.locations (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null,
  zone_id       uuid not null,
  label         text not null check (char_length(btrim(label)) between 1 and 60),
  row           int  not null check (row >= 0),
  col           int  not null check (col >= 0),
  row_span      int  not null default 1 check (row_span >= 1),
  col_span      int  not null default 1 check (col_span >= 1),
  unique (id, household_id),
  foreign key (zone_id, household_id) references public.zones (id, household_id) on delete cascade
);
create index locations_zone_idx on public.locations (zone_id);
create index locations_household_idx on public.locations (household_id);

create table public.categories (
  id                      uuid primary key default gen_random_uuid(),
  household_id            uuid not null references public.households (id) on delete cascade,
  name                    text not null check (char_length(btrim(name)) between 1 and 60),
  icon                    text not null default '🍽️' check (char_length(icon) <= 8),
  default_shelf_life_days int  check (default_shelf_life_days between 0 and 3650),
  opened_shelf_life_days  int  check (opened_shelf_life_days between 0 and 3650),
  default_zone_type       text not null default 'other' check (default_zone_type in ('fridge', 'freezer', 'pantry', 'other')),
  sort                    int  not null default 0,
  unique (id, household_id),
  unique (household_id, name)
);

create table public.products (
  id                      uuid primary key default gen_random_uuid(),
  household_id            uuid not null references public.households (id) on delete cascade,
  name                    text not null check (char_length(btrim(name)) between 1 and 80),
  category_id             uuid,
  barcode                 text check (barcode ~ '^[0-9]{6,14}$'),
  default_unit            text not null default 'ks' check (default_unit in ('ks', 'g', 'kg', 'ml', 'l', 'bal')),
  default_qty             numeric(10, 3) not null default 1 check (default_qty > 0),
  shelf_life_days         int check (shelf_life_days between 0 and 3650),
  opened_shelf_life_days  int check (opened_shelf_life_days between 0 and 3650),
  default_location_id     uuid,
  is_quick_add            boolean not null default false,
  image_url               text,
  price                   numeric(10, 2) check (price >= 0),
  archived                boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (id, household_id),
  foreign key (category_id, household_id) references public.categories (id, household_id)
    on delete set null (category_id),
  foreign key (default_location_id, household_id) references public.locations (id, household_id)
    on delete set null (default_location_id)
);
create index products_household_idx on public.products (household_id, name);
create unique index products_barcode_uidx on public.products (household_id, barcode) where barcode is not null;

create table public.stock_items (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  product_id     uuid not null,
  location_id    uuid,
  quantity       numeric(10, 3) not null check (quantity >= 0),
  unit           text not null check (unit in ('ks', 'g', 'kg', 'ml', 'l', 'bal')),
  purchased_on   date not null default public.today_prague(),
  expires_on     date,
  expiry_source  text not null default 'estimated' check (expiry_source in ('label', 'estimated')),
  opened_on      date,
  status         text not null default 'active' check (status in ('active', 'consumed', 'wasted')),
  added_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, household_id),
  foreign key (product_id, household_id) references public.products (id, household_id) on delete cascade,
  foreign key (location_id, household_id) references public.locations (id, household_id)
    on delete set null (location_id)
);
create index stock_items_active_idx on public.stock_items (household_id, expires_on) where status = 'active';
create index stock_items_location_idx on public.stock_items (location_id) where status = 'active';
create index stock_items_product_idx on public.stock_items (product_id);

create table public.stock_events (
  id                bigint generated always as identity primary key,
  household_id      uuid not null,
  stock_item_id     uuid not null,
  type              text not null check (type in ('add', 'consume', 'open', 'waste', 'move', 'adjust')),
  quantity          numeric(10, 3),
  from_location_id  uuid,
  to_location_id    uuid,
  at                timestamptz not null default now(),
  by_user           uuid references auth.users (id) on delete set null default auth.uid(),
  note              text check (char_length(note) <= 500),
  foreign key (stock_item_id, household_id) references public.stock_items (id, household_id) on delete cascade
);
create index stock_events_household_idx on public.stock_events (household_id, at desc);
create index stock_events_item_idx on public.stock_events (stock_item_id);

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();
create trigger stock_items_touch_updated_at
  before update on public.stock_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Práva a RLS
-- ---------------------------------------------------------------------------

revoke all on public.zones, public.locations, public.categories, public.products,
              public.stock_items, public.stock_events from anon, authenticated;

grant select, insert, update, delete on public.zones, public.locations, public.categories, public.products
  to authenticated;
grant select on public.stock_items, public.stock_events to authenticated;

alter table public.zones        enable row level security;
alter table public.locations    enable row level security;
alter table public.categories   enable row level security;
alter table public.products     enable row level security;
alter table public.stock_items  enable row level security;
alter table public.stock_events enable row level security;

create policy zones_member on public.zones for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy locations_member on public.locations for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy categories_member on public.categories for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy products_member on public.products for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy stock_items_select on public.stock_items for select to authenticated
  using (public.is_household_member(household_id));
create policy stock_events_select on public.stock_events for select to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Výchozí data domácnosti
-- ---------------------------------------------------------------------------

create function public.seed_household_defaults(p_household_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_zone uuid;
begin
  insert into public.categories
    (household_id, sort, name, icon, default_shelf_life_days, opened_shelf_life_days, default_zone_type)
  values
    (p_household_id,  1, 'Maso',                 '🥩',    3,    1, 'fridge'),
    (p_household_id,  2, 'Drůbež',               '🍗',    2,    1, 'fridge'),
    (p_household_id,  3, 'Ryby',                 '🐟',    2,    1, 'fridge'),
    (p_household_id,  4, 'Uzeniny',              '🥓',   10,    4, 'fridge'),
    (p_household_id,  5, 'Mléko a smetana',      '🥛',    7,    3, 'fridge'),
    (p_household_id,  6, 'Jogurty a tvaroh',     '🥣',   14,    3, 'fridge'),
    (p_household_id,  7, 'Sýry',                 '🧀',   21,    7, 'fridge'),
    (p_household_id,  8, 'Máslo a tuky',         '🧈',   30,   14, 'fridge'),
    (p_household_id,  9, 'Vejce',                '🥚',   21, null, 'fridge'),
    (p_household_id, 10, 'Zelenina',             '🥕',    7,    3, 'fridge'),
    (p_household_id, 11, 'Ovoce',                '🍎',    7,    2, 'other'),
    (p_household_id, 12, 'Bylinky',              '🌿',    5, null, 'fridge'),
    (p_household_id, 13, 'Pečivo',               '🥐',    2, null, 'pantry'),
    (p_household_id, 14, 'Chléb',                '🍞',    4, null, 'pantry'),
    (p_household_id, 15, 'Hotová jídla a zbytky','🍲',    3, null, 'fridge'),
    (p_household_id, 16, 'Mražené',              '🧊',  180,    2, 'freezer'),
    (p_household_id, 17, 'Suché potraviny',      '🍝',  365,  180, 'pantry'),
    (p_household_id, 18, 'Konzervy',             '🥫',  730,    3, 'pantry'),
    (p_household_id, 19, 'Omáčky a dresinky',    '🫙',  180,   30, 'pantry'),
    (p_household_id, 20, 'Nápoje',               '🧃',  180,    3, 'pantry'),
    (p_household_id, 21, 'Sladkosti a snacky',   '🍫',  120,   14, 'pantry'),
    (p_household_id, 22, 'Koření',               '🧂',  365,  365, 'pantry'),
    (p_household_id, 23, 'Ostatní',              '📦',   30,    7, 'other')
  on conflict (household_id, name) do nothing;

  if exists (select 1 from public.zones where household_id = p_household_id) then
    return;
  end if;

  -- Lednice: 5 řádků × 3 sloupce; police přes 2 sloupce, dveře ve 3. sloupci.
  insert into public.zones (household_id, name, type, grid_rows, grid_cols, sort)
    values (p_household_id, 'Lednice', 'fridge', 5, 3, 1) returning id into v_zone;
  insert into public.locations (household_id, zone_id, label, row, col, row_span, col_span) values
    (p_household_id, v_zone, 'Police 1 (nahoře)', 0, 0, 1, 2),
    (p_household_id, v_zone, 'Police 2',          1, 0, 1, 2),
    (p_household_id, v_zone, 'Police 3',          2, 0, 1, 2),
    (p_household_id, v_zone, 'Police 4',          3, 0, 1, 2),
    (p_household_id, v_zone, 'Šuplík zelenina',   4, 0, 1, 2),
    (p_household_id, v_zone, 'Dveře nahoře',      0, 2, 2, 1),
    (p_household_id, v_zone, 'Dveře uprostřed',   2, 2, 2, 1),
    (p_household_id, v_zone, 'Dveře dole',        4, 2, 1, 1);

  insert into public.zones (household_id, name, type, grid_rows, grid_cols, sort)
    values (p_household_id, 'Mrazák', 'freezer', 3, 1, 2) returning id into v_zone;
  insert into public.locations (household_id, zone_id, label, row, col) values
    (p_household_id, v_zone, 'Šuplík 1', 0, 0),
    (p_household_id, v_zone, 'Šuplík 2', 1, 0),
    (p_household_id, v_zone, 'Šuplík 3', 2, 0);

  insert into public.zones (household_id, name, type, grid_rows, grid_cols, sort)
    values (p_household_id, 'Spíž', 'pantry', 4, 2, 3) returning id into v_zone;
  insert into public.locations (household_id, zone_id, label, row, col) values
    (p_household_id, v_zone, 'Police 1 – vlevo',  0, 0),
    (p_household_id, v_zone, 'Police 1 – vpravo', 0, 1),
    (p_household_id, v_zone, 'Police 2 – vlevo',  1, 0),
    (p_household_id, v_zone, 'Police 2 – vpravo', 1, 1),
    (p_household_id, v_zone, 'Police 3 – vlevo',  2, 0),
    (p_household_id, v_zone, 'Police 3 – vpravo', 2, 1),
    (p_household_id, v_zone, 'Police 4 – vlevo',  3, 0),
    (p_household_id, v_zone, 'Police 4 – vpravo', 3, 1);
end;
$$;

-- Zakládání domácnosti nově rovnou doplní výchozí kategorie a zóny.
create or replace function public.create_household(p_name text, p_display_name text, p_color text default '#2563eb')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Nejsi přihlášený.' using errcode = '42501';
  end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'Už jsi členem domácnosti.' using errcode = 'P0001';
  end if;

  insert into public.households (name, created_by) values (btrim(p_name), v_uid) returning id into v_id;
  insert into public.household_members (household_id, user_id, role, display_name, color)
    values (v_id, v_uid, 'admin', btrim(p_display_name), p_color);
  insert into public.settings (household_id) values (v_id);
  perform public.seed_household_defaults(v_id);
  return v_id;
end;
$$;

-- Existující domácnosti.
select public.seed_household_defaults(id) from public.households;

-- ---------------------------------------------------------------------------
-- RPC: změny zásob (vždy se zápisem události)
-- ---------------------------------------------------------------------------

-- Načte aktivní položku a ověří členství. Zamkne řádek do konce transakce.
create function public._stock_item_for_update(p_item_id uuid)
returns public.stock_items
language plpgsql security definer set search_path = ''
as $$
declare
  v_item public.stock_items;
begin
  select * into v_item from public.stock_items where id = p_item_id for update;
  if not found or not public.is_household_member(v_item.household_id) then
    raise exception 'Položka neexistuje.' using errcode = 'P0002';
  end if;
  if v_item.status <> 'active' then
    raise exception 'Položka už není ve skladu.' using errcode = 'P0001';
  end if;
  return v_item;
end;
$$;

-- Přidá položku. Bez p_expires_on se expirace odhadne: nákup + trvanlivost produktu, jinak kategorie.
create function public.add_stock(
  p_product_id   uuid,
  p_location_id  uuid default null,
  p_quantity     numeric default null,
  p_unit         text default null,
  p_purchased_on date default null,
  p_expires_on   date default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_product   public.products;
  v_shelf     int;
  v_purchased date := coalesce(p_purchased_on, public.today_prague());
  v_location  uuid;
  v_id        uuid;
begin
  select * into v_product from public.products where id = p_product_id;
  if not found or not public.is_household_member(v_product.household_id) then
    raise exception 'Produkt neexistuje.' using errcode = 'P0002';
  end if;

  v_location := coalesce(p_location_id, v_product.default_location_id);
  if v_location is not null
     and not exists (select 1 from public.locations where id = v_location and household_id = v_product.household_id) then
    raise exception 'Místo neexistuje.' using errcode = 'P0002';
  end if;

  v_shelf := coalesce(
    v_product.shelf_life_days,
    (select c.default_shelf_life_days from public.categories c where c.id = v_product.category_id)
  );

  insert into public.stock_items
    (household_id, product_id, location_id, quantity, unit, purchased_on, expires_on, expiry_source)
  values (
    v_product.household_id, v_product.id, v_location,
    coalesce(p_quantity, v_product.default_qty),
    coalesce(p_unit, v_product.default_unit),
    v_purchased,
    coalesce(p_expires_on, v_purchased + v_shelf),
    case when p_expires_on is not null then 'label' else 'estimated' end
  )
  returning id into v_id;

  insert into public.stock_events (household_id, stock_item_id, type, quantity, to_location_id)
    values (v_product.household_id, v_id, 'add', coalesce(p_quantity, v_product.default_qty), v_location);
  return v_id;
end;
$$;

-- Snědeno / vyhozeno. Bez množství (nebo s množstvím ≥ zůstatku) se odepíše celá položka.
create function public.take_stock(p_item_id uuid, p_kind text, p_quantity numeric default null, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item public.stock_items := public._stock_item_for_update(p_item_id);
  v_qty  numeric;
begin
  if p_kind not in ('consume', 'waste') then
    raise exception 'Neznámá akce.' using errcode = '22023';
  end if;
  if p_quantity is not null and p_quantity <= 0 then
    raise exception 'Množství musí být kladné.' using errcode = '22023';
  end if;
  v_qty := least(coalesce(p_quantity, v_item.quantity), v_item.quantity);

  if v_qty >= v_item.quantity then
    update public.stock_items
      set quantity = 0, status = case p_kind when 'consume' then 'consumed' else 'wasted' end
      where id = v_item.id;
  else
    update public.stock_items set quantity = quantity - v_qty where id = v_item.id;
  end if;

  insert into public.stock_events (household_id, stock_item_id, type, quantity, note)
    values (v_item.household_id, v_item.id, p_kind, v_qty, nullif(btrim(p_note), ''));
end;
$$;

-- Otevřeno: expirace = min(původní, dnes + trvanlivost po otevření).
create function public.open_stock(p_item_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item   public.stock_items := public._stock_item_for_update(p_item_id);
  v_opened int;
  v_today  date := public.today_prague();
begin
  if v_item.opened_on is not null then
    return;
  end if;
  select coalesce(p.opened_shelf_life_days, c.opened_shelf_life_days) into v_opened
    from public.products p left join public.categories c on c.id = p.category_id
    where p.id = v_item.product_id;

  update public.stock_items
    set opened_on = v_today,
        expires_on = case
          when v_opened is null then expires_on
          when expires_on is null then v_today + v_opened
          else least(expires_on, v_today + v_opened)
        end
    where id = v_item.id;

  insert into public.stock_events (household_id, stock_item_id, type)
    values (v_item.household_id, v_item.id, 'open');
end;
$$;

create function public.move_stock(p_item_id uuid, p_location_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item public.stock_items := public._stock_item_for_update(p_item_id);
begin
  if p_location_id is not null
     and not exists (select 1 from public.locations where id = p_location_id and household_id = v_item.household_id) then
    raise exception 'Místo neexistuje.' using errcode = 'P0002';
  end if;
  if p_location_id is not distinct from v_item.location_id then
    return;
  end if;
  update public.stock_items set location_id = p_location_id where id = v_item.id;
  insert into public.stock_events (household_id, stock_item_id, type, from_location_id, to_location_id)
    values (v_item.household_id, v_item.id, 'move', v_item.location_id, p_location_id);
end;
$$;

-- Ruční oprava množství nebo data expirace (datum z obalu => expiry_source = label).
create function public.adjust_stock(p_item_id uuid, p_quantity numeric default null, p_expires_on date default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item public.stock_items := public._stock_item_for_update(p_item_id);
begin
  if p_quantity is not null and p_quantity <= 0 then
    raise exception 'Množství musí být kladné.' using errcode = '22023';
  end if;
  update public.stock_items
    set quantity      = coalesce(p_quantity, quantity),
        expires_on    = coalesce(p_expires_on, expires_on),
        expiry_source = case when p_expires_on is not null then 'label' else expiry_source end
    where id = v_item.id;
  insert into public.stock_events (household_id, stock_item_id, type, quantity, note)
    values (v_item.household_id, v_item.id, 'adjust', p_quantity,
            case when p_expires_on is not null then 'expirace ' || to_char(p_expires_on, 'YYYY-MM-DD') end);
end;
$$;

revoke execute on function public.today_prague()                          from public, anon;
revoke execute on function public.seed_household_defaults(uuid)           from public, anon, authenticated;
revoke execute on function public._stock_item_for_update(uuid)            from public, anon, authenticated;
revoke execute on function public.add_stock(uuid, uuid, numeric, text, date, date) from public, anon;
revoke execute on function public.take_stock(uuid, text, numeric, text)   from public, anon;
revoke execute on function public.open_stock(uuid)                        from public, anon;
revoke execute on function public.move_stock(uuid, uuid)                  from public, anon;
revoke execute on function public.adjust_stock(uuid, numeric, date)       from public, anon;

grant execute on function public.today_prague()                          to authenticated;
grant execute on function public.add_stock(uuid, uuid, numeric, text, date, date) to authenticated;
grant execute on function public.take_stock(uuid, text, numeric, text)   to authenticated;
grant execute on function public.open_stock(uuid)                        to authenticated;
grant execute on function public.move_stock(uuid, uuid)                  to authenticated;
grant execute on function public.adjust_stock(uuid, numeric, date)       to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (postgres_changes respektuje RLS)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.zones, public.locations, public.categories, public.products, public.stock_items;
