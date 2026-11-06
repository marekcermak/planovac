-- Fáze 5a: úkoly (sdílené / soukromé, přiřazení, termín, priorita, opakování, Top 3 na den).

create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title          text not null check (char_length(btrim(title)) between 1 and 200),
  notes          text check (char_length(notes) <= 4000),
  visibility     text not null default 'shared' check (visibility in ('shared', 'private')),
  assignee_id    uuid,
  due_date       date,
  -- 0 = nízká, 1 = normální, 2 = vysoká
  priority       smallint not null default 1 check (priority between 0 and 2),
  -- Úkol je v Top 3 pro tento den.
  top3_on        date,
  -- Opakování: daily | weekdays | weekly | monthly | yearly (jednodušší než RRULE, stačí pro domácnost).
  recurrence     text check (recurrence in ('daily', 'weekdays', 'weekly', 'monthly', 'yearly')),
  -- Další výskyt opakovaného úkolu ukazuje na předchozí (kvůli vrácení „hotovo“).
  prev_task_id   uuid references public.tasks (id) on delete set null,
  done_at        timestamptz,
  done_by        uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (household_id, assignee_id) references public.household_members (household_id, user_id)
    on delete set null (assignee_id),
  -- Soukromý úkol nejde přiřadit někomu jinému.
  check (visibility = 'shared' or assignee_id is null or assignee_id = owner_id)
);
create index tasks_household_idx on public.tasks (household_id, done_at, due_date);
create index tasks_prev_idx on public.tasks (prev_task_id) where prev_task_id is not null;

create function public.tasks_touch()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  -- Vlastník se nemění.
  new.owner_id := old.owner_id;
  new.household_id := old.household_id;
  return new;
end;
$$;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.tasks_touch();

revoke all on public.tasks from anon, authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
alter table public.tasks enable row level security;

-- Sdílené vidí a mění celá domácnost, soukromé jen vlastník (SPEC kap. 3).
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_household_member(household_id) and (visibility = 'shared' or owner_id = (select auth.uid())));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_household_member(household_id) and owner_id = (select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_household_member(household_id) and (visibility = 'shared' or owner_id = (select auth.uid())))
  with check (visibility = 'shared' or owner_id = (select auth.uid()));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_household_member(household_id) and (visibility = 'shared' or owner_id = (select auth.uid())));

-- Další termín opakovaného úkolu: od původního termínu (nebo dneška), ale ne do minulosti.
create function public.next_due(p_from date, p_rule text)
returns date
language plpgsql immutable set search_path = ''
as $$
declare
  v date := p_from;
begin
  loop
    v := case p_rule
      when 'daily'   then v + 1
      when 'weekly'  then v + 7
      when 'monthly' then (v + interval '1 month')::date
      when 'yearly'  then (v + interval '1 year')::date
      when 'weekdays' then v + case extract(isodow from v)::int when 5 then 3 when 6 then 2 else 1 end
    end;
    exit when v is null or v > p_from;
  end loop;
  return v;
end;
$$;

-- Hotovo / vrátit. U opakovaného úkolu „hotovo“ založí další výskyt, „vrátit“ ho zase smaže
-- (pokud ještě není hotový). Vrací id nového výskytu, nebo null.
create function public.set_task_done(p_task_id uuid, p_done boolean)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_task  public.tasks;
  v_next  uuid;
  v_today date := public.today_prague();
  v_due   date;
begin
  -- security invoker: RLS rozhodne, jestli úkol uživatel vidí / smí měnit.
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
      -- Vlastníkem dalšího výskytu je ten, kdo odškrtl (u soukromého je to stejně vlastník).
      insert into public.tasks (household_id, title, notes, visibility, assignee_id, due_date, priority, recurrence, prev_task_id)
        values (v_task.household_id, v_task.title, v_task.notes, v_task.visibility, v_task.assignee_id,
                v_due, v_task.priority, v_task.recurrence, v_task.id)
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

revoke execute on function public.set_task_done(uuid, boolean) from public, anon;
grant execute on function public.set_task_done(uuid, boolean) to authenticated;
grant execute on function public.next_due(date, text) to authenticated;

alter publication supabase_realtime add table public.tasks;
