-- 2026-11-09: úkol pracovní / nepracovní (jiná barva v seznamu, filtr Práce / Osobní).

alter table public.tasks add column is_work boolean not null default false;

-- Další výskyt opakovaného úkolu zdědí i „pracovní“.
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
                                prev_task_id, horizon, is_work)
        values (v_task.household_id, v_task.title, v_task.notes, v_task.visibility, v_task.assignee_id,
                v_due, v_task.priority, v_task.recurrence, v_task.id,
                case when v_task.horizon = 'long' then 'long' when v_due <= v_today then 'today' else 'week' end, v_task.is_work)
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
