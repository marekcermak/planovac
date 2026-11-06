-- Fáze 4a: suroviny, kuchařka (kapitoly, recepty, suroviny receptu, fotky), AI útrata.
-- Vše patří domácnosti; členové čtou i zapisují přímo (RLS na členství).

-- ---------------------------------------------------------------------------
-- Suroviny
-- ---------------------------------------------------------------------------

create table public.ingredients (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  is_staple     boolean not null default false,  -- „mám vždy doma“ (sůl, pepř, voda…)
  created_at    timestamptz not null default now(),
  unique (id, household_id),
  unique (household_id, name)
);

create table public.ingredient_aliases (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null,
  ingredient_id  uuid not null,
  alias          text not null check (char_length(btrim(alias)) between 1 and 60),
  foreign key (ingredient_id, household_id) references public.ingredients (id, household_id) on delete cascade
);
create index ingredient_aliases_ingredient_idx on public.ingredient_aliases (ingredient_id);
create index ingredient_aliases_household_idx on public.ingredient_aliases (household_id);

alter table public.products add column ingredient_id uuid;
alter table public.products
  add constraint products_ingredient_fk foreign key (ingredient_id, household_id)
  references public.ingredients (id, household_id) on delete set null (ingredient_id);
create index products_ingredient_idx on public.products (ingredient_id);

-- ---------------------------------------------------------------------------
-- Kuchařka
-- ---------------------------------------------------------------------------

create table public.recipe_categories (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 40),
  icon          text not null default '🍽️' check (char_length(icon) <= 8),
  sort          int  not null default 0,
  unique (id, household_id),
  unique (household_id, name)
);

create table public.recipes (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  title         text not null check (char_length(btrim(title)) between 1 and 160),
  servings      int  check (servings between 1 and 100),
  prep_minutes  int  check (prep_minutes between 0 and 10000),
  steps         text not null default '' check (char_length(steps) <= 20000),
  source_type   text not null default 'manual' check (source_type in ('manual', 'url', 'photo', 'ai', 'text')),
  source_url    text check (char_length(source_url) <= 2000),
  image_url     text check (char_length(image_url) <= 2000),  -- obrázek z webu
  photo_paths   text[] not null default '{}',                 -- vlastní fotky ve Storage
  rating        int  check (rating between 1 and 5),
  tags          text[] not null default '{}',
  notes         text not null default '' check (char_length(notes) <= 10000),
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, household_id)
);
create index recipes_household_idx on public.recipes (household_id, title);

create trigger recipes_touch_updated_at
  before update on public.recipes
  for each row execute function public.touch_updated_at();

create table public.recipe_category_links (
  household_id  uuid not null,
  recipe_id     uuid not null,
  category_id   uuid not null,
  primary key (recipe_id, category_id),
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade,
  foreign key (category_id, household_id) references public.recipe_categories (id, household_id) on delete cascade
);
create index recipe_category_links_household_idx on public.recipe_category_links (household_id);

create table public.recipe_ingredients (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null,
  recipe_id      uuid not null,
  sort           int  not null default 0,
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  ingredient_id  uuid,
  quantity       numeric(10, 3) check (quantity > 0),
  unit           text check (char_length(unit) <= 20),
  optional       boolean not null default false,
  note           text check (char_length(note) <= 200),
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade,
  foreign key (ingredient_id, household_id) references public.ingredients (id, household_id)
    on delete set null (ingredient_id)
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, sort);
create index recipe_ingredients_household_idx on public.recipe_ingredients (household_id);

create table public.cook_log (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null,
  recipe_id     uuid not null,
  cooked_at     timestamptz not null default now(),
  by_user       uuid references auth.users (id) on delete set null default auth.uid(),
  servings      int check (servings between 1 and 100),
  foreign key (recipe_id, household_id) references public.recipes (id, household_id) on delete cascade
);
create index cook_log_recipe_idx on public.cook_log (recipe_id, cooked_at desc);

-- ---------------------------------------------------------------------------
-- AI útrata (zapisuje jen Edge Function `ai` přes service role)
-- ---------------------------------------------------------------------------

create table public.ai_usage (
  id             bigint generated always as identity primary key,
  household_id   uuid not null references public.households (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null,
  at             timestamptz not null default now(),
  feature        text not null,
  model          text not null,
  input_tokens   int not null default 0,
  output_tokens  int not null default 0,
  est_cost_czk   numeric(10, 4) not null default 0
);
create index ai_usage_household_idx on public.ai_usage (household_id, at desc);

-- Ceny v Kč za milion tokenů (Claude Haiku 5.5: $0,10 / $0,50 při ~24 Kč/$).
alter table public.settings alter column ai_price_input_per_mtok set default 2.4;
alter table public.settings alter column ai_price_output_per_mtok set default 12;
update public.settings
  set ai_price_input_per_mtok = coalesce(ai_price_input_per_mtok, 2.4),
      ai_price_output_per_mtok = coalesce(ai_price_output_per_mtok, 12);

-- ---------------------------------------------------------------------------
-- Práva a RLS
-- ---------------------------------------------------------------------------

revoke all on public.ingredients, public.ingredient_aliases, public.recipe_categories, public.recipes,
              public.recipe_category_links, public.recipe_ingredients, public.cook_log, public.ai_usage
  from anon, authenticated;

grant select, insert, update, delete on public.ingredients, public.ingredient_aliases, public.recipe_categories,
  public.recipes, public.recipe_category_links, public.recipe_ingredients, public.cook_log to authenticated;
grant select on public.ai_usage to authenticated;

alter table public.ingredients           enable row level security;
alter table public.ingredient_aliases    enable row level security;
alter table public.recipe_categories     enable row level security;
alter table public.recipes               enable row level security;
alter table public.recipe_category_links enable row level security;
alter table public.recipe_ingredients    enable row level security;
alter table public.cook_log              enable row level security;
alter table public.ai_usage              enable row level security;

create policy ingredients_member on public.ingredients for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy ingredient_aliases_member on public.ingredient_aliases for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy recipe_categories_member on public.recipe_categories for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy recipes_member on public.recipes for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy recipe_category_links_member on public.recipe_category_links for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy recipe_ingredients_member on public.recipe_ingredients for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy cook_log_member on public.cook_log for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy ai_usage_select on public.ai_usage for select to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Storage: fotky receptů, cesta {household_id}/{recipe_id}/{soubor}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create function public.storage_household_member(p_name text)
returns boolean
language plpgsql stable set search_path = ''
as $$
begin
  return public.is_household_member(split_part(p_name, '/', 1)::uuid);
exception when invalid_text_representation then
  return false;
end;
$$;
grant execute on function public.storage_household_member(text) to authenticated;
revoke execute on function public.storage_household_member(text) from public, anon;

create policy recipe_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'recipe-photos' and public.storage_household_member(name));
create policy recipe_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and public.storage_household_member(name));
create policy recipe_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'recipe-photos' and public.storage_household_member(name))
  with check (bucket_id = 'recipe-photos' and public.storage_household_member(name));
create policy recipe_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and public.storage_household_member(name));

-- ---------------------------------------------------------------------------
-- Výchozí suroviny a kapitoly
-- ---------------------------------------------------------------------------

create function public.seed_kitchen_defaults(p_household_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  with seed(name, aliases, staple) as (
    values
      -- mléčné a vejce
      ('mléko', '{}'::text[], false),
      ('smetana ke šlehání', '{šlehačka,smetana na šlehání,šlehačková smetana}', false),
      ('zakysaná smetana', '{kysaná smetana}', false),
      ('smetana na vaření', '{smetana}', false),
      ('máslo', '{}', false),
      ('bílý jogurt', '{jogurt}', false),
      ('řecký jogurt', '{}', false),
      ('tvaroh', '{}', false),
      ('mascarpone', '{}', false),
      ('ricotta', '{}', false),
      ('sýr', '{eidam,gouda,ementál,strouhaný sýr}', false),
      ('parmazán', '{parmezán,grana padano}', false),
      ('mozzarella', '{mozarella}', false),
      ('feta', '{balkánský sýr,sýr feta}', false),
      ('niva', '{plísňový sýr,gorgonzola}', false),
      ('cottage', '{cottage cheese}', false),
      ('vejce', '{vajíčko,vajec,žloutek,bílek}', false),
      ('podmáslí', '{}', false),
      ('kefír', '{}', false),
      -- maso
      ('kuřecí prsa', '{kuřecí řízky,kuřecí prsní řízek,kuřecí prsní řízky}', false),
      ('kuřecí stehna', '{kuřecí stehno,kuřecí horní stehna}', false),
      ('kuře', '{celé kuře}', false),
      ('kuřecí maso', '{}', false),
      ('krůtí maso', '{krůtí prsa}', false),
      ('vepřová plec', '{plec}', false),
      ('vepřová krkovice', '{krkovice}', false),
      ('vepřová panenka', '{panenka}', false),
      ('vepřový bok', '{bůček}', false),
      ('vepřové maso', '{vepřové}', false),
      ('hovězí maso', '{hovězí}', false),
      ('hovězí zadní', '{}', false),
      ('hovězí přední', '{}', false),
      ('mleté maso', '{mleté hovězí,mleté vepřové,mleté maso mix}', false),
      ('slanina', '{anglická slanina}', false),
      ('šunka', '{}', false),
      ('klobása', '{}', false),
      ('párky', '{párek}', false),
      ('salám', '{}', false),
      ('uzený špek', '{špek}', false),
      ('uzené maso', '{uzené}', false),
      ('kachna', '{kachní stehna}', false),
      ('králík', '{}', false),
      ('kuřecí játra', '{játra}', false),
      -- ryby
      ('losos', '{}', false),
      ('treska', '{}', false),
      ('tuňák', '{}', false),
      ('kapr', '{}', false),
      ('pstruh', '{}', false),
      ('krevety', '{kreveta}', false),
      ('rybí filé', '{filé}', false),
      -- zelenina
      ('brambory', '{brambor}', false),
      ('cibule', '{cibulka}', false),
      ('červená cibule', '{}', false),
      ('jarní cibulka', '{zelená cibulka}', false),
      ('česnek', '{stroužek česneku,stroužky česneku}', false),
      ('mrkev', '{mrkve,mrkví}', false),
      ('petržel kořen', '{kořenová petržel}', false),
      ('celer', '{bulvový celer}', false),
      ('řapíkatý celer', '{}', false),
      ('pórek', '{pórku}', false),
      ('rajčata', '{rajče}', false),
      ('cherry rajčata', '{cherry}', false),
      ('rajčatový protlak', '{protlak}', false),
      ('loupaná rajčata', '{drcená rajčata,passata,rajčata v plechovce}', false),
      ('paprika', '{červená paprika,žlutá paprika,zelená paprika}', false),
      ('kapie', '{}', false),
      ('okurka', '{salátová okurka}', false),
      ('kyselé okurky', '{sterilované okurky,okurky sterilované,kyselá okurka}', false),
      ('cuketa', '{}', false),
      ('lilek', '{lilku}', false),
      ('dýně', '{hokaido}', false),
      ('brokolice', '{}', false),
      ('květák', '{květáku}', false),
      ('zelí', '{bílé zelí}', false),
      ('kysané zelí', '{}', false),
      ('červené zelí', '{}', false),
      ('kapusta', '{}', false),
      ('špenát', '{listový špenát}', false),
      ('hlávkový salát', '{salát}', false),
      ('polníček', '{}', false),
      ('rukola', '{}', false),
      ('ledový salát', '{}', false),
      ('žampiony', '{žampion}', false),
      ('houby', '{hřiby,sušené houby}', false),
      ('kukuřice', '{}', false),
      ('hrášek', '{}', false),
      ('fazolové lusky', '{lusky}', false),
      ('ředkvičky', '{ředkvička}', false),
      ('červená řepa', '{řepa}', false),
      ('batáty', '{batát,sladké brambory}', false),
      ('avokádo', '{}', false),
      ('chilli paprička', '{chilli,feferonka,feferonky}', false),
      ('zázvor', '{}', false),
      -- ovoce
      ('jablka', '{jablko}', false),
      ('hrušky', '{hruška}', false),
      ('banány', '{banán}', false),
      ('citron', '{citrón,citronová šťáva,citrónová šťáva}', false),
      ('limetka', '{limetková šťáva}', false),
      ('pomeranč', '{}', false),
      ('jahody', '{jahoda}', false),
      ('borůvky', '{}', false),
      ('maliny', '{}', false),
      ('švestky', '{švestka}', false),
      ('meruňky', '{meruňka}', false),
      ('hroznové víno', '{hrozny}', false),
      ('rozinky', '{}', false),
      ('brusinky', '{}', false),
      -- bylinky
      ('petrželka', '{petrželová nať,nať}', false),
      ('pažitka', '{}', false),
      ('kopr', '{}', false),
      ('bazalka', '{}', false),
      ('tymián', '{}', false),
      ('rozmarýn', '{}', false),
      ('oregano', '{}', false),
      ('majoránka', '{majoránku}', false),
      ('koriandr', '{}', false),
      ('máta', '{}', false),
      -- suché potraviny a pečivo
      ('hladká mouka', '{mouka}', false),
      ('polohrubá mouka', '{}', false),
      ('hrubá mouka', '{}', false),
      ('celozrnná mouka', '{}', false),
      ('kukuřičný škrob', '{solamyl,škrob,maizena}', false),
      ('prášek do pečiva', '{kypřicí prášek}', false),
      ('droždí', '{kvasnice}', false),
      ('jedlá soda', '{}', false),
      ('rýže', '{basmati,jasmínová rýže}', false),
      ('rizotová rýže', '{arborio}', false),
      ('těstoviny', '{}', false),
      ('špagety', '{}', false),
      ('penne', '{}', false),
      ('lasagne', '{lasagne plátky}', false),
      ('nudle', '{vaječné nudle}', false),
      ('kuskus', '{}', false),
      ('bulgur', '{}', false),
      ('quinoa', '{}', false),
      ('čočka', '{}', false),
      ('fazole', '{červené fazole}', false),
      ('cizrna', '{}', false),
      ('ovesné vločky', '{vločky}', false),
      ('strouhanka', '{}', false),
      ('krupice', '{dětská krupice}', false),
      ('cukr', '{cukr krystal,krupicový cukr}', false),
      ('moučkový cukr', '{}', false),
      ('vanilkový cukr', '{}', false),
      ('třtinový cukr', '{}', false),
      ('med', '{}', false),
      ('kakao', '{}', false),
      ('čokoláda', '{hořká čokoláda,mléčná čokoláda}', false),
      ('vlašské ořechy', '{ořechy}', false),
      ('lískové ořechy', '{}', false),
      ('mandle', '{}', false),
      ('strouhaný kokos', '{kokos}', false),
      ('sezam', '{}', false),
      ('mák', '{}', false),
      ('rohlíky', '{rohlík}', false),
      ('chléb', '{chleba}', false),
      ('toastový chléb', '{toust}', false),
      ('tortilly', '{tortilla}', false),
      ('listové těsto', '{}', false),
      ('piškoty', '{}', false),
      -- tuky, omáčky, nálevy
      ('olej', '{slunečnicový olej,rostlinný olej,řepkový olej}', true),
      ('olivový olej', '{}', false),
      ('sádlo', '{}', false),
      ('ocet', '{}', false),
      ('balzamikový ocet', '{balsamico}', false),
      ('sójová omáčka', '{}', false),
      ('kečup', '{}', false),
      ('hořčice', '{}', false),
      ('majonéza', '{}', false),
      ('worcesterská omáčka', '{worcester}', false),
      ('pesto', '{}', false),
      ('vývar', '{bujón,bujon,kostka bujónu}', false),
      ('kokosové mléko', '{}', false),
      -- koření
      ('sůl', '{soli,solí}', true),
      ('pepř', '{mletý pepř,černý pepř}', true),
      ('mletá paprika', '{sladká paprika,paprika mletá,uzená paprika}', false),
      ('kmín', '{}', false),
      ('bobkový list', '{bobkové listy,bobkového listu}', false),
      ('nové koření', '{}', false),
      ('skořice', '{}', false),
      ('muškátový oříšek', '{muškát}', false),
      ('hřebíček', '{}', false),
      ('kari', '{curry}', false),
      ('vanilka', '{vanilkový lusk}', false),
      -- tekutiny
      ('voda', '{}', true),
      ('bílé víno', '{víno}', false),
      ('červené víno', '{}', false),
      ('pivo', '{}', false)
  ),
  ins as (
    insert into public.ingredients (household_id, name, is_staple)
    select p_household_id, name, staple from seed
    on conflict (household_id, name) do nothing
    returning id, name
  )
  insert into public.ingredient_aliases (household_id, ingredient_id, alias)
  select p_household_id, ins.id, a
  from ins join seed on seed.name = ins.name, unnest(seed.aliases) a;

  insert into public.recipe_categories (household_id, name, icon, sort) values
    (p_household_id, 'Polévky',        '🍲',  1),
    (p_household_id, 'Těstoviny',      '🍝',  2),
    (p_household_id, 'Maso',           '🥩',  3),
    (p_household_id, 'Drůbež',         '🍗',  4),
    (p_household_id, 'Ryby',           '🐟',  5),
    (p_household_id, 'Bezmasé',        '🥦',  6),
    (p_household_id, 'Saláty',         '🥗',  7),
    (p_household_id, 'Přílohy',        '🍚',  8),
    (p_household_id, 'Snídaně',        '🍳',  9),
    (p_household_id, 'Sladké',         '🍰', 10),
    (p_household_id, 'Pečení',         '🥧', 11),
    (p_household_id, 'Omáčky a dipy',  '🥣', 12)
  on conflict (household_id, name) do nothing;
end;
$$;
revoke execute on function public.seed_kitchen_defaults(uuid) from public, anon, authenticated;

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
  perform public.seed_kitchen_defaults(v_id);
  return v_id;
end;
$$;

select public.seed_kitchen_defaults(id) from public.households;

-- Existující produkty spárovat se surovinou podle názvu (nejdelší shoda celého slova, bez diakritiky).
create extension if not exists unaccent with schema extensions;
update public.products p
set ingredient_id = m.ingredient_id
from (
  select distinct on (p2.id) p2.id as product_id, c.ingredient_id
  from public.products p2
  join (
    select i.household_id, i.id as ingredient_id, i.name as term from public.ingredients i
    union all
    select a.household_id, a.ingredient_id, a.alias from public.ingredient_aliases a
  ) c on c.household_id = p2.household_id
     and extensions.unaccent(lower(p2.name))
         ~ ('(^|[^[:alpha:]])' || extensions.unaccent(lower(c.term)) || '($|[^[:alpha:]])')
  where p2.ingredient_id is null
  order by p2.id, char_length(c.term) desc
) m
where p.id = m.product_id;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.ingredients, public.ingredient_aliases, public.recipe_categories, public.recipes,
            public.recipe_category_links, public.recipe_ingredients;
