-- Fáze 1: domácnost, členové, pozvánky, nastavení + RLS.
-- Zápisy, které musí být atomické nebo obcházejí RLS (založení domácnosti,
-- pozvánka, přijetí pozvánky), jdou přes security definer funkce níže.

-- ---------------------------------------------------------------------------
-- Tabulky
-- ---------------------------------------------------------------------------

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.household_members (
  household_id  uuid not null references public.households (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null default 'member' check (role in ('admin', 'member')),
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 40),
  color         text not null default '#2563eb' check (color ~ '^#[0-9a-fA-F]{6}$'),
  joined_at     timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Zatím jeden uživatel = jedna domácnost (zjednodušuje UI i RLS).
create unique index household_members_one_household_per_user
  on public.household_members (user_id);

create table public.household_invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  token         text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_by    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_by   uuid references auth.users (id) on delete set null,
  accepted_at   timestamptz,
  revoked_at    timestamptz
);

create index household_invites_household_idx on public.household_invites (household_id);

create table public.settings (
  household_id              uuid primary key references public.households (id) on delete cascade,
  timezone                  text not null default 'Europe/Prague',
  expiry_warn_days          int  not null default 2 check (expiry_warn_days between 0 and 30),
  notify_time               time not null default '07:30',
  zivyobraz_enabled         boolean not null default false,
  display_fields            jsonb not null default '{}'::jsonb,
  ai_enabled                boolean not null default false,
  ai_monthly_limit_czk      numeric(10, 2) not null default 100 check (ai_monthly_limit_czk >= 0),
  ai_price_input_per_mtok   numeric(10, 4),
  ai_price_output_per_mtok  numeric(10, 4),
  ai_model                  text not null default 'claude-haiku-5-5',
  updated_at                timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Pomocné funkce pro RLS (security definer => bez rekurze přes RLS)
-- ---------------------------------------------------------------------------

create function public.is_household_member(p_household_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.user_id = (select auth.uid())
  );
$$;

create function public.is_household_admin(p_household_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = (select auth.uid())
      and m.role = 'admin'
  );
$$;

create function public.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger settings_touch_updated_at
  before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Práva: anon nemá nic, authenticated jen to, co dovolí RLS.
-- ---------------------------------------------------------------------------

revoke all on public.households, public.household_members,
              public.household_invites, public.settings from anon, authenticated;

grant select, update (name)                    on public.households        to authenticated;
grant select, delete, update (display_name, color) on public.household_members to authenticated;
grant select, update (revoked_at)              on public.household_invites to authenticated;
grant select, update (expiry_warn_days, notify_time, zivyobraz_enabled, display_fields,
                      ai_enabled, ai_monthly_limit_czk, ai_price_input_per_mtok,
                      ai_price_output_per_mtok, ai_model)
                                                on public.settings          to authenticated;

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.settings          enable row level security;

-- households
create policy households_select on public.households
  for select to authenticated using (public.is_household_member(id));
create policy households_update on public.households
  for update to authenticated
  using (public.is_household_admin(id)) with check (public.is_household_admin(id));

-- household_members
create policy members_select on public.household_members
  for select to authenticated using (public.is_household_member(household_id));
create policy members_update_self on public.household_members
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy members_delete_by_admin on public.household_members
  for delete to authenticated
  using (public.is_household_admin(household_id) and user_id <> (select auth.uid()));

-- household_invites
create policy invites_select_admin on public.household_invites
  for select to authenticated using (public.is_household_admin(household_id));
create policy invites_revoke_admin on public.household_invites
  for update to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

-- settings
create policy settings_select on public.settings
  for select to authenticated using (public.is_household_member(household_id));
create policy settings_update_admin on public.settings
  for update to authenticated
  using (public.is_household_admin(household_id))
  with check (public.is_household_admin(household_id));

-- ---------------------------------------------------------------------------
-- RPC funkce
-- ---------------------------------------------------------------------------

-- Založí domácnost, zakladatele jako admina a výchozí nastavení.
create function public.create_household(p_name text, p_display_name text, p_color text default '#2563eb')
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
  return v_id;
end;
$$;

-- Admin vytvoří novou pozvánku (platí 7 dní, jednorázová).
create function public.create_invite(p_household_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.is_household_admin(p_household_id) then
    raise exception 'Pozvánku může vytvořit jen správce domácnosti.' using errcode = '42501';
  end if;
  insert into public.household_invites (household_id, created_by)
    values (p_household_id, auth.uid())
    returning token into v_token;
  return v_token;
end;
$$;

-- Informace o pozvánce pro obrazovku „Přidat se“ (bez přístupu k ostatním datům).
create function public.get_invite(p_token text)
returns table (household_name text, invited_by text, status text)
language sql stable security definer set search_path = ''
as $$
  select h.name,
         coalesce(m.display_name, 'člen domácnosti'),
         case
           when i.revoked_at is not null  then 'revoked'
           when i.accepted_at is not null then 'used'
           when i.expires_at < now()      then 'expired'
           else 'valid'
         end
  from public.household_invites i
  join public.households h on h.id = i.household_id
  left join public.household_members m
    on m.household_id = i.household_id and m.user_id = i.created_by
  where i.token = p_token
    and auth.uid() is not null;
$$;

-- Přijme pozvánku a přidá přihlášeného uživatele do domácnosti.
create function public.accept_invite(p_token text, p_display_name text, p_color text default '#db2777')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_invite public.household_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'Nejsi přihlášený.' using errcode = '42501';
  end if;

  select * into v_invite from public.household_invites where token = p_token for update;
  if not found then
    raise exception 'Pozvánka neexistuje.' using errcode = 'P0002';
  end if;
  if v_invite.revoked_at is not null or v_invite.accepted_at is not null or v_invite.expires_at < now() then
    raise exception 'Pozvánka už neplatí.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'Už jsi členem domácnosti.' using errcode = 'P0001';
  end if;

  insert into public.household_members (household_id, user_id, role, display_name, color)
    values (v_invite.household_id, v_uid, 'member', btrim(p_display_name), p_color);
  update public.household_invites
    set accepted_by = v_uid, accepted_at = now()
    where id = v_invite.id;
  return v_invite.household_id;
end;
$$;

revoke execute on function public.is_household_member(uuid)            from public, anon;
revoke execute on function public.is_household_admin(uuid)             from public, anon;
revoke execute on function public.create_household(text, text, text)   from public, anon;
revoke execute on function public.create_invite(uuid)                  from public, anon;
revoke execute on function public.get_invite(text)                     from public, anon;
revoke execute on function public.accept_invite(text, text, text)      from public, anon;
revoke execute on function public.touch_updated_at()                   from public, anon, authenticated;

grant execute on function public.is_household_member(uuid)          to authenticated;
grant execute on function public.is_household_admin(uuid)           to authenticated;
grant execute on function public.create_household(text, text, text) to authenticated;
grant execute on function public.create_invite(uuid)                to authenticated;
grant execute on function public.get_invite(text)                   to authenticated;
grant execute on function public.accept_invite(text, text, text)    to authenticated;
