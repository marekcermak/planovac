import { Plus, Users } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Button, Card, Chip, ErrorText } from '../../components/ui'
import { todayIso } from '../../stock/expiry'
import { dueLabel, HORIZON_LABEL, HORIZONS, movePatch, parseQuickTask, taskBucket, type Horizon } from '../../tasks/dates'
import { TASK_DRAG_MIME, TaskRow } from '../../tasks/TaskRow'
import { TaskSheet } from '../../tasks/TaskSheet'
import { useTasks, type Task } from '../../tasks/TasksProvider'

type Filter = 'mine' | 'all' | 'done'

const EMPTY_TEXT: Record<Horizon, string> = {
  today: 'Na dnes nic. Úkol z týdne sem dostaneš šipkou „Dnes“.',
  week: 'Na tento týden nic.',
  long: 'Dlouhodobé úkoly – věci, které nespěchají, ale nechceš na ně zapomenout.',
}

const pragueDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' })
const doneDayFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Hotové úkoly po dnech dokončení (nejnovější nahoře). */
function groupByDoneDay(list: Task[]): [string, Task[]][] {
  const m = new Map<string, Task[]>()
  for (const t of list.slice().sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))) {
    const day = pragueDay.format(new Date(t.done_at!))
    m.set(day, [...(m.get(day) ?? []), t])
  }
  return [...m.entries()]
}

function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback
  } catch {
    return fallback
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* soukromé okno – nevadí */
  }
}

export function TasksPage() {
  const { tasks, loading, error, add, update, isMine, loadOlderDone } = useTasks()
  const [target, setTarget] = useState<Horizon>(() => readPref<Horizon>('tasks.target', 'today'))
  const [dropOn, setDropOn] = useState<Horizon | null>(null)
  const [olderState, setOlderState] = useState<'idle' | 'loading' | 'end'>('idle')
  const [params, setParams] = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  // Výchozí: jen pro mě; „Společný“ se zapíná ručně (rozhodnuto 2026-11-08).
  const [isShared, setIsShared] = useState(false)
  const isPrivate = !isShared
  const [filter, setFilter] = useState<Filter>(() => readPref<Filter>('tasks.filter', 'mine'))
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const parsed = parseQuickTask(text)
  const today = todayIso()
  // Termín z textu rozhodne sám (dnes → Dnes), jinak vybraná sekce.
  const newHorizon: Horizon = parsed.due ? (parsed.due <= today ? 'today' : target === 'long' ? 'long' : 'week') : target

  // „T“ na PC / odkaz ?novy=1 → kurzor do pole pro nový úkol.
  useEffect(() => {
    if (params.get('novy')) {
      inputRef.current?.focus()
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!parsed.title.trim()) return
    setBusy(true)
    setFormError(null)
    try {
      await add({
        title: parsed.title.trim(),
        due_date: parsed.due,
        priority: parsed.important ? 2 : 1,
        visibility: isPrivate ? 'private' : 'shared',
        horizon: newHorizon,
      })
      setText('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Nepodařilo se přidat.')
    } finally {
      setBusy(false)
    }
  }

  const setF = (f: Filter) => {
    setFilter(f)
    writePref('tasks.filter', f)
  }

  const visible = tasks.filter((t) => (filter === 'done' ? !!t.done_at : !t.done_at && (filter === 'all' || isMine(t))))

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void submit(e)}>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIsShared((v) => !v)}
            aria-pressed={isShared}
            aria-label="Společný úkol (vidíme oba)"
            title={isShared ? 'Společný – vidíte oba' : 'Jen pro mě – ťukni pro společný'}
            className={`flex size-12 shrink-0 items-center justify-center rounded-xl ring-1 ${
              isShared ? 'bg-brand-700 text-white ring-brand-700' : 'text-neutral-400 ring-neutral-300 dark:ring-neutral-700'
            }`}
          >
            <Users className="size-5" />
          </button>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nový úkol… (např. Zavolat do školky zítra)"
            enterKeyHint="done"
            maxLength={200}
            className="block min-h-12 w-full flex-1 rounded-xl border border-neutral-300 bg-white px-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <Button type="submit" aria-label="Přidat úkol" disabled={busy || !parsed.title.trim()}>
            <Plus className="size-5" />
          </Button>
        </div>
        {text.trim() && (
          <p className="mt-1 pl-14 text-sm text-neutral-500">
            {[HORIZON_LABEL[newHorizon].toLowerCase(), parsed.due && `termín ${dueLabel(parsed.due)}`, parsed.important && 'vysoká priorita', isShared ? 'společný – vidíte oba' : 'jen pro mě']
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2 pl-14">
          <span className="text-sm text-neutral-500">Přidat do</span>
          {HORIZONS.map((h) => (
            <Chip
              key={h}
              active={target === h}
              onClick={() => {
                setTarget(h)
                writePref('tasks.target', h)
              }}
            >
              {h === 'week' ? 'Týden' : HORIZON_LABEL[h]}
            </Chip>
          ))}
        </div>
      </form>
      <ErrorText>{formError ?? error}</ErrorText>

      <div className="flex gap-2">
        <Chip active={filter === 'mine'} onClick={() => setF('mine')}>
          Moje
        </Chip>
        <Chip active={filter === 'all'} onClick={() => setF('all')}>
          Všechny
        </Chip>
        <Chip active={filter === 'done'} onClick={() => setF('done')}>
          Hotové
        </Chip>
      </div>

      {tasks.length === 0 && !loading && (
        <Card>
          <p className="text-neutral-500">
            {'Žádné úkoly. Napiš nahoru, co je potřeba udělat – termín můžeš dopsat na konec („zítra“, „v pátek“, „15. 11.“), „!“ = důležité.'}
          </p>
        </Card>
      )}
      {filter === 'done' ? (
        <>
          {visible.length === 0 && !loading && <p className="text-neutral-500">Za posledních 14 dní nic hotového.</p>}
          {groupByDoneDay(visible).map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-1.5 text-sm font-semibold text-neutral-500 first-letter:uppercase">
                {doneDayFmt.format(new Date(`${day}T12:00:00Z`))} · {list.length}
              </h2>
              <List tasks={list} onOpen={setOpenId} />
            </section>
          ))}
          {olderState !== 'end' && (
            <Button
              variant="secondary"
              className="w-full"
              disabled={olderState === 'loading'}
              onClick={() => {
                setOlderState('loading')
                void loadOlderDone()
                  .then((more) => setOlderState(more ? 'idle' : 'end'))
                  .catch(() => setOlderState('idle'))
              }}
            >
              {olderState === 'loading' ? 'Načítám…' : 'Načíst starší'}
            </Button>
          )}
        </>
      ) : (
        HORIZONS.map((h) => {
          const list = visible.filter((t) => taskBucket(t, today) === h).sort(SORT[h])
          return (
            <section
              key={h}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(TASK_DRAG_MIME)) return
                e.preventDefault()
                setDropOn(h)
              }}
              onDragLeave={() => setDropOn((d) => (d === h ? null : d))}
              onDrop={(e) => {
                setDropOn(null)
                const id = e.dataTransfer.getData(TASK_DRAG_MIME)
                const t = tasks.find((x) => x.id === id)
                if (!t || taskBucket(t, today) === h) return
                e.preventDefault()
                void update(t.id, movePatch(t, h, today)).catch((err: Error) => setFormError(err.message))
              }}
              className={`rounded-2xl ${dropOn === h ? 'ring-2 ring-brand-600 ring-offset-4 dark:ring-offset-neutral-950' : ''}`}
            >
              <h2 className="mb-1.5 flex items-baseline gap-2 text-base font-semibold">
                {HORIZON_LABEL[h]}
                <span className="text-sm font-normal text-neutral-500">{list.length || ''}</span>
              </h2>
              {list.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-700">
                  {EMPTY_TEXT[h]}
                </p>
              ) : (
                <List tasks={list} onOpen={setOpenId} showMove />
              )}
            </section>
          )
        })
      )}

      <TaskSheet taskId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

/** Dnes: po termínu a důležité nahoře. Týden: podle termínu. Dlouhodobé: podle priority a stáří. */
const SORT: Record<Horizon, (a: Task, b: Task) => number> = {
  today: (a, b) =>
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || b.priority - a.priority || a.created_at.localeCompare(b.created_at),
  week: (a, b) =>
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || b.priority - a.priority || a.created_at.localeCompare(b.created_at),
  long: (a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at),
}

function List({ tasks, onOpen, showMove = false }: { tasks: Task[]; onOpen: (id: string) => void; showMove?: boolean }) {
  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} onOpen={() => onOpen(t.id)} showMove={showMove} />
      ))}
    </ul>
  )
}
