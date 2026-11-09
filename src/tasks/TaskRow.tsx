import { ArrowDown, ArrowUp, Check, Repeat, Star, Users } from 'lucide-react'
import { useToast } from '../components/Toast'
import { Avatar } from '../components/ui'
import { useHousehold } from '../household/HouseholdProvider'
import { daysLeft, todayIso } from '../stock/expiry'
import { dueLabel, movePatch, taskBucket, type Horizon } from './dates'
import { useTasks, type Task } from './TasksProvider'

/** Kam úkol posunout jedním ťuknutím: Dnes ↔ Týden, Dlouhodobé → Týden. */
const MOVE: Record<Horizon, { to: Horizon; label: string; up: boolean }> = {
  today: { to: 'week', label: 'Týden', up: false },
  week: { to: 'today', label: 'Dnes', up: true },
  long: { to: 'week', label: 'Týden', up: true },
}

export const TASK_DRAG_MIME = 'application/x-task-id'

const doneFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' })

/** Řádek úkolu: kolečko = hotovo, text = detail, hvězda = Top 3 na dnes. */
export function TaskRow({
  task,
  onOpen,
  showStar = true,
  showMove = false,
}: {
  task: Task
  onOpen: () => void
  showStar?: boolean
  /** Tlačítko přesunu Dnes ↔ Týden (a na PC přetažení myší). */
  showMove?: boolean
}) {
  const { setDone, update, top3 } = useTasks()
  const { members } = useHousehold()
  const toast = useToast()
  const done = !!task.done_at
  const assignee = members.length > 1 && task.assignee_id ? members.find((m) => m.user_id === task.assignee_id) : undefined
  const late = !done && task.due_date ? -daysLeft(task.due_date)! : 0
  const overdue = late > 0
  const today = todayIso()
  const pinned = task.top3_on === today
  const pinnedCount = top3.filter((t) => t.top3_on === today).length

  function togglePin() {
    if (!pinned && pinnedCount >= 3) return toast('Top 3 už je plná – nejdřív jeden úkol odeber.', 'error')
    // Hvězda = dnes; úkol se zároveň přesune do „Dnes“.
    void update(task.id, pinned ? { top3_on: null } : { top3_on: today, horizon: 'today' }).catch((e: Error) =>
      toast(e.message, 'error'),
    )
  }

  const move = showMove && !done ? MOVE[taskBucket(task, today)] : null
  function doMove() {
    if (!move) return
    void update(task.id, movePatch(task, move.to, today)).catch((e: Error) => toast(e.message, 'error'))
  }

  return (
    <li
      className={`flex min-h-14 items-center ${overdue ? 'bg-red-50 dark:bg-red-950/40' : ''}`}
      draggable={showMove && !done}
      onDragStart={
        showMove && !done
          ? (e) => {
              e.dataTransfer.setData(TASK_DRAG_MIME, task.id)
              e.dataTransfer.effectAllowed = 'move'
            }
          : undefined
      }
    >
      <button
        aria-label={done ? `Vrátit: ${task.title}` : `Hotovo: ${task.title}`}
        onClick={() => void setDone(task, !done).catch((e: Error) => toast(e.message, 'error'))}
        className="flex size-14 shrink-0 items-center justify-center"
      >
        <span
          className={`flex size-7 items-center justify-center rounded-full ring-2 ${
            done
              ? 'bg-brand-700 text-white ring-brand-700'
              : task.priority === 2
                ? 'ring-red-500'
                : 'ring-neutral-300 dark:ring-neutral-600'
          }`}
        >
          {done && <Check className="size-4" />}
        </span>
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 py-2 pr-2 text-left">
        <span className={`block font-medium ${done ? 'text-neutral-500 line-through' : ''}`}>{task.title}</span>
        {(task.due_date || task.done_at || task.recurrence || task.visibility === 'shared' || task.notes) && (
          <span className="flex flex-wrap items-center gap-x-2 text-sm text-neutral-500">
            {done && task.done_at ? (
              <span>hotovo {doneFmt.format(new Date(task.done_at))}</span>
            ) : overdue ? (
              <span className="font-semibold text-red-700 dark:text-red-400">
                ⚠ měl být hotový {late === 1 ? 'včera' : `před ${late} dny`}
              </span>
            ) : (
              task.due_date && <span>{dueLabel(task.due_date)}</span>
            )}
            {task.recurrence && <Repeat className="size-3.5" aria-label="Opakuje se" />}
            {task.visibility === 'shared' && <Users className="size-3.5" aria-label="Společný" />}
            {task.notes && <span className="truncate">{task.notes.split('\n')[0]}</span>}
          </span>
        )}
      </button>
      {assignee && (
        <span className="shrink-0 pr-1" title={assignee.display_name}>
          <Avatar name={assignee.display_name} color={assignee.color} size="sm" />
        </span>
      )}
      {move && (
        <button
          onClick={doMove}
          aria-label={`Přesunout na ${move.to === 'today' ? 'dnes' : 'tento týden'}`}
          title={`Přesunout: ${move.label}`}
          className="flex h-12 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          {move.up ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
          {move.label}
        </button>
      )}
      {showStar && !done && (
        <button
          aria-label={pinned ? 'Odebrat z Top 3' : 'Přidat do Top 3 na dnes'}
          aria-pressed={pinned}
          onClick={togglePin}
          className="flex size-12 shrink-0 items-center justify-center"
        >
          <Star className={`size-5 ${pinned ? 'fill-amber-400 text-amber-400' : 'text-neutral-300 dark:text-neutral-600'}`} />
        </button>
      )}
    </li>
  )
}
