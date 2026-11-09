import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { Button, Chip, ErrorText, Field, SelectField } from '../components/ui'
import { useHousehold } from '../household/HouseholdProvider'
import { addDays, todayIso } from '../stock/expiry'
import { PinButton } from '../display/PinButton'
import { HORIZON_LABEL, HORIZONS, RECURRENCE_LABEL, taskBucket, type Horizon } from './dates'
import { useTasks, type Task } from './TasksProvider'

/** Detail úkolu – úpravy všech polí. Úkol se bere živě ze stavu (realtime). */
export function TaskSheet({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const { tasks } = useTasks()
  const task = (taskId && tasks.find((t) => t.id === taskId)) || null
  return (
    <Sheet open={task !== null} onClose={onClose} title="Úkol">
      {task && <TaskForm key={task.id} task={task} onDone={onClose} />}
    </Sheet>
  )
}

const PRIORITIES: [number, string][] = [
  [0, 'Nízká'],
  [1, 'Normální'],
  [2, 'Vysoká'],
]

function TaskForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const { update, remove } = useTasks()
  const { members, me } = useHousehold()
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [due, setDue] = useState(task.due_date ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [visibility, setVisibility] = useState(task.visibility)
  const [assignee, setAssignee] = useState(task.assignee_id ?? '')
  const [recurrence, setRecurrence] = useState(task.recurrence ?? '')
  const [isWork, setIsWork] = useState(task.is_work)
  const [horizon, setHorizon] = useState<Horizon>(() => taskBucket(task))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isOwner = task.owner_id === me?.user_id
  const today = todayIso()

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se uložit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void run(() =>
          update(task.id, {
            title: title.trim(),
            notes: notes.trim() || null,
            due_date: due || null,
            priority,
            visibility,
            assignee_id: visibility === 'private' ? null : assignee || null,
            recurrence: recurrence || null,
            horizon,
            is_work: isWork,
            // Mimo „Dnes“ nedává smysl hvězda Top 3.
            ...(horizon !== 'today' ? { top3_on: null } : {}),
          }),
        )
      }}
    >
      <Field label="Co" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Poznámka</span>
        <textarea
          rows={3}
          maxLength={4000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Kam patří</span>
        <div className="flex flex-wrap gap-2">
          {HORIZONS.map((h) => (
            <Chip
              key={h}
              active={horizon === h}
              onClick={() => {
                setHorizon(h)
                // Termín dnes / v minulosti by úkol vrátil do „Dnes“.
                if (h !== 'today' && due && due <= today) setDue('')
              }}
            >
              {HORIZON_LABEL[h]}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Termín</span>
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            active={due === today}
            onClick={() => {
              setDue(today)
              setHorizon('today')
            }}
          >
            Dnes
          </Chip>
          <Chip
            active={due === addDays(today, 1)}
            onClick={() => {
              setDue(addDays(today, 1))
              if (horizon === 'today') setHorizon('week')
            }}
          >
            Zítra
          </Chip>
          <Chip active={!due} onClick={() => setDue('')}>
            Bez termínu
          </Chip>
          <input
            type="date"
            aria-label="Datum"
            value={due}
            onChange={(e) => {
              setDue(e.target.value)
              if (e.target.value && e.target.value <= today) setHorizon('today')
            }}
            className="min-h-10 rounded-xl border border-neutral-300 bg-white px-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Druh</span>
        <div className="flex gap-2">
          <Chip active={!isWork} onClick={() => setIsWork(false)}>
            🏠 Osobní
          </Chip>
          <Chip
            active={isWork}
            onClick={() => setIsWork(true)}
            className={isWork ? '!bg-indigo-600 !ring-indigo-600' : ''}
          >
            💼 Pracovní
          </Chip>
        </div>
      </div>

      <SelectField label="Opakování" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
        <option value="">Neopakuje se</option>
        {Object.entries(RECURRENCE_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </SelectField>
      {recurrence && <p className="-mt-2 text-sm text-neutral-500">Po odškrtnutí se založí další výskyt.</p>}

      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Priorita</span>
        <div className="flex gap-2">
          {PRIORITIES.map(([p, label]) => (
            <Chip key={p} active={priority === p} onClick={() => setPriority(p)}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      {isOwner && (
        <div>
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Kdo ho vidí</span>
          <div className="flex gap-2">
            <Chip active={visibility === 'private'} onClick={() => setVisibility('private')}>
              Jen já
            </Chip>
            <Chip active={visibility === 'shared'} onClick={() => setVisibility('shared')}>
              Společný (vidíme oba)
            </Chip>
          </div>
          {visibility === 'shared' && <p className="mt-1 text-sm text-neutral-500">Společné úkoly na dnes a tento týden se ukážou i na displeji.</p>}
        </div>
      )}

      {visibility === 'shared' && members.length > 1 && (
        <div>
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Kdo ho udělá</span>
          <div className="flex flex-wrap gap-2">
            <Chip active={!assignee} onClick={() => setAssignee('')}>
              Kdokoli
            </Chip>
            {members.map((m) => (
              <Chip key={m.user_id} active={assignee === m.user_id} onClick={() => setAssignee(m.user_id)}>
                {m.display_name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <PinButton kind="task" refId={task.id} text={task.title} className="w-full" />
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={busy || !title.trim()}>
          Uložit
        </Button>
        {confirmDelete ? (
          <Button type="button" variant="danger" disabled={busy} onClick={() => void run(() => remove(task.id))}>
            Opravdu smazat
          </Button>
        ) : (
          <Button type="button" variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-5" /> Smazat
          </Button>
        )}
      </div>
    </form>
  )
}
