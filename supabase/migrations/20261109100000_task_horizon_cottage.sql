-- 2026-11-09
-- 1) Úkoly rozdělené na Dnes / Tento týden / Dlouhodobé (sloupec horizon, přesun jedním ťuknutím).
-- 2) Chata: co vzít na chatu a co z chaty do Prahy (sdílené v domácnosti, realtime).

-- ---------------------------------------------------------------------------
-- Úkoly: horizont
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column horizon text not null default 'week' check (horizon in ('today', 'week', 'long'));

-- Dosavadní úkoly s termínem dnes / po termínu nebo v Top 3 patří do „Dnes“.
update public.tasks set horizon = 'today'
  where done_at is null and (due_date <= public.today_prague() or top3_on = public.today_prague());

-- Další výskyt opakovaného úkolu: horizont podle termínu (dnes → Dnes, jinak Týden;
-- dlouhodobý zůstává dlouhodobým).
create or replace function public.set_task_done(p_task_id uuid, p_done boolean)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_task  public.tasks;
  v_next  uuid;
  v_today date := public.today_prague();
  v_due   date;
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Úkol neexistuje.' using errcode = 'P0002';
  end if;

  if p_done then
    if v_task.done_at is not null then return null; end if;
    update public.tasks set done_at = now(), done_by = auth.uid(), top3_on = null where id = v_task.id;
    if v_task.recurrence is not null then
      v_due := public.next_due(coalesce(v_task.due_date, v_today), v_task.recurrence);
      while v_due < v_today loop
        v_due := public.next_due(v_due, v_task.recurrence);
      end loop;
      insert into public.tasks (household_id, title, notes, visibility, assignee_id, due_date, priority, recurrence,
                                prev_task_id, horizon)
        values (v_task.household_id, v_task.title, v_task.notes, v_task.visibility, v_task.assignee_id,
                v_due, v_task.priority, v_task.recurrence, v_task.id,
                case when v_task.horizon = 'long' then 'long' when v_due <= v_today then 'today' else 'week' end)
        returning id into v_next;
    end if;
    return v_next;
  else
    if v_task.done_at is null then return null; end if;
    update public.tasks set done_at = null, done_by = null where id = v_task.id;
    delete from public.tasks where prev_task_id = v_task.id and done_at is null;
    return null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Chata
-- ---------------------------------------------------------------------------

create table public.cottage_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  -- to_cottage = z Prahy na chatu, to_prague = z chaty do Prahy
  direction     text not null check (direction in ('to_cottage', 'to_prague')),
  text          text not null check (char_length(btrim(text)) between 1 and 120),
  note          text check (char_length(note) <= 300),
  -- Zabaleno (odškrtnuto).
  packed        boolean not null default false,
  packed_at     timestamptz,
  added_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index cottage_items_household_idx on public.cottage_items (household_id, direction, created_at);

revoke all on public.cottage_items from anon, authenticated;
grant select, insert, update, delete on public.cottage_items to authenticated;
alter table public.cottage_items enable row level security;
create policy cottage_items_member on public.cottage_items for all to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

alter publication supabase_realtime add table public.cottage_items;
