-- 1) Přechod do jiné domácnosti přes pozvánku.
--    Kdo si omylem založil vlastní domácnost, se může přidat k partnerovi:
--    je-li v ní sám, domácnost se smaže i s daty; jinak ji jen opustí.
-- 2) Stav naplnění položky skladu (plná / půlka / prázdná).

-- ---------------------------------------------------------------------------
-- Přechod do jiné domácnosti
-- ---------------------------------------------------------------------------

-- Co se stane se současnou domácností při přijetí pozvánky (pro obrazovku pozvánky).
create function public.current_household_summary()
returns table (household_name text, members int, stock_items int, recipes int, tasks int, journal_entries int)
language sql stable security definer set search_path = ''
as $$
  select h.name,
         (select count(*)::int from public.household_members m where m.household_id = h.id),
         (select count(*)::int from public.stock_items s where s.household_id = h.id and s.status = 'active'),
         (select count(*)::int from public.recipes r where r.household_id = h.id),
         (select count(*)::int from public.tasks t where t.household_id = h.id),
         (select count(*)::int from public.journal_entries j where j.household_id = h.id)
  from public.household_members me
  join public.households h on h.id = me.household_id
  where me.user_id = auth.uid();
$$;

create function public.switch_household(p_token text, p_display_name text, p_color text default '#db2777')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_invite  public.household_invites%rowtype;
  v_current public.household_members%rowtype;
  v_others  int;
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

  select * into v_current from public.household_members where user_id = v_uid for update;
  if found then
    if v_current.household_id = v_invite.household_id then
      raise exception 'Do této domácnosti už patříš.' using errcode = 'P0001';
    end if;
    select count(*) into v_others from public.household_members
      where household_id = v_current.household_id and user_id <> v_uid;
    if v_others = 0 then
      -- Jediný člen: domácnost i se vším obsahem zaniká (FK on delete cascade).
      delete from public.households where id = v_current.household_id;
    else
      delete from public.household_members where household_id = v_current.household_id and user_id = v_uid;
      -- Domácnost nesmí zůstat bez správce.
      if v_current.role = 'admin' and not exists (
        select 1 from public.household_members where household_id = v_current.household_id and role = 'admin'
      ) then
        update public.household_members set role = 'admin'
          where household_id = v_current.household_id
            and user_id = (select user_id from public.household_members
                           where household_id = v_current.household_id order by joined_at limit 1);
      end if;
    end if;
  end if;

  insert into public.household_members (household_id, user_id, role, display_name, color)
    values (v_invite.household_id, v_uid, 'member', btrim(p_display_name), p_color);
  update public.household_invites
    set accepted_by = v_uid, accepted_at = now()
    where id = v_invite.id;
  return v_invite.household_id;
end;
$$;

revoke execute on function public.current_household_summary()          from public, anon;
revoke execute on function public.switch_household(text, text, text)   from public, anon;
grant execute on function public.current_household_summary()           to authenticated;
grant execute on function public.switch_household(text, text, text)    to authenticated;

-- ---------------------------------------------------------------------------
-- Stav naplnění: 2 = plná, 1 = půlka, 0 = prázdná
-- ---------------------------------------------------------------------------

alter table public.stock_items
  add column fill_level smallint not null default 2 check (fill_level between 0 and 2);

create function public.set_stock_fill(p_item_id uuid, p_level int)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item public.stock_items := public._stock_item_for_update(p_item_id);
begin
  if p_level is null or p_level not between 0 and 2 then
    raise exception 'Neplatný stav naplnění.' using errcode = '22023';
  end if;
  update public.stock_items set fill_level = p_level where id = v_item.id;
end;
$$;

revoke execute on function public.set_stock_fill(uuid, int) from public, anon;
grant execute on function public.set_stock_fill(uuid, int) to authenticated;
