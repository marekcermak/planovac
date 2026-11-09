import { Briefcase, CalendarDays, Check, ChevronDown, House, ListFilter, Plus, User, Users, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Button, ErrorText } from '../../components/ui'
import { todayIso } from '../../stock/expiry'
import { dueLabel, HORIZON_LABEL, HORIZONS, movePatch, parseQuickTask, taskBucket, type Horizon } from '../../tasks/dates'
import { TASK_DRAG_MIME, TaskRow } from '../../tasks/TaskRow'
import { TaskSheet } from '../../tasks/TaskSheet'
import { useTasks, type Task } from '../../tasks/TasksProvider'

type Filter = 'all' | 'done' | 'home' | 'work'

const FILTERS: [Filter, string][] = [
  ['all', 'Všechny úkoly'],
  ['done', 'Hotové'],
  ['home', 'Jen osobní'],
  ['work', 'Jen pracovní'],
]

/**
 * Nastavení pole pro nový úkol drží jen v paměti: mezi záložkami zůstane (přidám „dnes, já, pracovní“
 * a další úkol má totéž), po novém spuštění aplikace je zase výchozí Dnes · Jen já · Osobní.
 */
const composer: { target: Horizon; shared: boolean; work: boolean } = { target: 'today', shared: false, work: false }

const EMPTY_TEXT: Record<Horizon, string> = {
  today: 'Na dnes nic. Úkol z týdne sem dostaneš šipkou „Dnes“.',
  week: 'Na tento týden nic.',
  long: 'Věci, které nespěchají, ale nechceš na ně zapomenout.',
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

/** Dnes a Týden: podle termínu, pak priority. Dlouhodobé: podle priority a stáří. */
const SORT: Record<Horizon, (a: Task, b: Task) => number> = {
  today: (a, b) =>
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || b.priority - a.priority || a.created_at.localeCompare(b.created_at),
  week: (a, b) =>
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || b.priority - a.priority || a.created_at.localeCompare(b.created_at),
  long: (a, b) => b.priority - a.priority || a.created_at.localeCompare(b.created_at),
}

/**
 * Úkoly (inspirace Todoist): nahoře karta pro nový úkol s jeho vlastnostmi,
 * pod ní přepínač zobrazení a sekce Dnes / Tento týden / Dlouhodobé (sbalitelné).
 */
export function TasksPage() {
  const { tasks, loading, error, add, update, loadOlderDone } = useTasks()
  const [params, setParams] = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)

  // Nový úkol
  const [text, setText] = useState('')
  const [target, setTarget] = useState<Horizon>(composer.target)
  const [isShared, setIsShared] = useState(composer.shared)
  const [isWork, setIsWork] = useState(composer.work)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Zobrazení
  // Výchozí vždy všechny úkoly (moje i společné, osobní i pracovní).
  const [filter, setFilter] = useState<Filter>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<string>(() => readPref('tasks.collapsed', ''))
  const [dropOn, setDropOn] = useState<Horizon | null>(null)
  const [olderState, setOlderState] = useState<'idle' | 'loading' | 'end'>('idle')
  const [openId, setOpenId] = useState<string | null>(null)

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
        visibility: isShared ? 'shared' : 'private',
        horizon: newHorizon,
        is_work: isWork,
      })
      setText('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Nepodařilo se přidat.')
    } finally {
      setBusy(false)
    }
  }

  const chooseTarget = (h: Horizon) => {
    setTarget(h)
    composer.target = h
  }
  const toggleWork = () => {
    composer.work = !isWork
    setIsWork(!isWork)
  }
  const toggleShared = () => {
    composer.shared = !isShared
    setIsShared(!isShared)
  }
  const toggleCollapsed = (h: Horizon) => {
    const set = new Set(collapsed.split(',').filter(Boolean))
    if (set.has(h)) set.delete(h)
    else set.add(h)
    const v = [...set].join(',')
    setCollapsed(v)
    writePref('tasks.collapsed', v)
  }

  const visible = tasks.filter((t) =>
    filter === 'done' ? !!t.done_at : !t.done_at && (filter === 'all' || (filter === 'work') === t.is_work),
  )

  return (
    <div className="space-y-5">
      {/* ---------- Nový úkol ---------- */}
      <form
        onSubmit={(e) => void submit(e)}
        className={`rounded-2xl bg-white p-2 shadow-sm ring-1 focus-within:ring-2 dark:bg-neutral-900 ${
          isWork
            ? 'ring-indigo-300 focus-within:ring-indigo-500 dark:ring-indigo-800'
            : 'ring-neutral-200 focus-within:ring-brand-600 dark:ring-neutral-800'
        }`}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Přidat úkol… (např. Zavolat do školky zítra)"
            enterKeyHint="done"
            maxLength={200}
            className="block min-h-11 w-full flex-1 bg-transparent px-2 text-base outline-none"
          />
          <Button type="submit" aria-label="Přidat úkol" className="min-h-10 px-3" disabled={busy || !parsed.title.trim()}>
            <Plus className="size-5" />
          </Button>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-neutral-100 px-1 pt-2 dark:border-neutral-800">
          <label
            className={`relative inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium ring-1 ${
              newHorizon === 'today'
                ? 'text-green-700 ring-green-300 dark:text-green-400 dark:ring-green-800'
                : newHorizon === 'week'
                  ? 'text-violet-700 ring-violet-300 dark:text-violet-400 dark:ring-violet-800'
                  : 'text-neutral-600 ring-neutral-300 dark:text-neutral-300 dark:ring-neutral-700'
            }`}
          >
            <CalendarDays className="size-4" />
            {parsed.due ? `${HORIZON_LABEL[newHorizon]} · ${dueLabel(parsed.due)}` : HORIZON_LABEL[newHorizon]}
            <ChevronDown className="size-3.5 opacity-60" />
            <select
              aria-label="Kam úkol přidat"
              value={target}
              onChange={(e) => chooseTarget(e.target.value as Horizon)}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {HORIZON_LABEL[h]}
                </option>
              ))}
            </select>
          </label>
          <Pill
            active={isShared}
            onClick={toggleShared}
            icon={isShared ? <Users className="size-4" /> : <User className="size-4" />}
            activeClass="bg-brand-50 text-brand-800 ring-brand-300 dark:bg-brand-800/30 dark:text-brand-100 dark:ring-brand-700"
            title={isShared ? 'Společný – vidíte oba' : 'Jen pro mě – ťukni pro společný'}
          >
            {isShared ? 'Společný' : 'Jen já'}
          </Pill>
          <Pill
            active={isWork}
            onClick={toggleWork}
            icon={isWork ? <Briefcase className="size-4" /> : <House className="size-4" />}
            activeClass="bg-indigo-50 text-indigo-800 ring-indigo-300 dark:bg-indigo-950/50 dark:text-indigo-200 dark:ring-indigo-700"
            title={isWork ? 'Pracovní úkol' : 'Osobní úkol – ťukni pro pracovní'}
          >
            {isWork ? 'Pracovní' : 'Osobní'}
          </Pill>
          {parsed.important && <span className="text-sm font-medium text-red-600">! důležité</span>}
        </div>
      </form>
      <ErrorText>{formError ?? error}</ErrorText>

      {/* ---------- Filtr ---------- */}
      <div className="relative -mb-2 flex items-center justify-end gap-2">
        {filter !== 'all' && (
          <button
            onClick={() => setFilter('all')}
            className={`inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-medium ${
              filter === 'work'
                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200'
                : 'bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-white'
            }`}
          >
            {FILTERS.find(([f]) => f === filter)?.[1]} <X className="size-3.5" />
          </button>
        )}
        <button
          onClick={() => setFilterOpen((v) => !v)}
          aria-label="Filtr úkolů"
          aria-expanded={filterOpen}
          className={`flex size-10 items-center justify-center rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
            filter !== 'all' ? 'text-brand-700 dark:text-brand-500' : 'text-neutral-500'
          }`}
        >
          <ListFilter className="size-5" />
        </button>
        {filterOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setFilterOpen(false)} aria-hidden />
            <ul
              role="menu"
              className="absolute top-11 right-0 z-30 w-56 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-700"
            >
              {FILTERS.map(([f, label]) => (
                <li key={f}>
                  <button
                    role="menuitemradio"
                    aria-checked={filter === f}
                    onClick={() => {
                      setFilter(f)
                      setFilterOpen(false)
                    }}
                    className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    {f === 'all' && <ListFilter className="size-4 text-neutral-400" />}
                    {f === 'done' && <Check className="size-4 text-neutral-400" />}
                    {f === 'home' && <House className="size-4 text-neutral-400" />}
                    {f === 'work' && <Briefcase className="size-4 text-indigo-500" />}
                    <span className="flex-1">{label}</span>
                    {filter === f && <Check className="size-4 text-brand-700" />}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {tasks.length === 0 && !loading && (
        <p className="text-neutral-500">
          Žádné úkoly. Napiš nahoru, co je potřeba udělat – termín můžeš dopsat na konec („zítra“, „v pátek“, „15. 11.“), „!“ = důležité.
        </p>
      )}

      {filter === 'done' ? (
        <>
          {visible.length === 0 && !loading && <p className="text-neutral-500">Za posledních 14 dní nic hotového.</p>}
          {groupByDoneDay(visible).map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-1.5 border-b border-neutral-200 pb-1 text-sm font-semibold text-neutral-500 first-letter:uppercase dark:border-neutral-800">
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
          const isCollapsed = collapsed.split(',').includes(h)
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
              <button
                onClick={() => toggleCollapsed(h)}
                aria-expanded={!isCollapsed}
                className="mb-2 flex w-full items-center gap-2 border-b border-neutral-200 pb-1.5 text-left dark:border-neutral-800"
              >
                <ChevronDown className={`size-4 text-neutral-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                <span className="text-base font-bold">{HORIZON_LABEL[h]}</span>
                <span className="text-sm text-neutral-500 tabular-nums">{list.length || ''}</span>
              </button>
              {!isCollapsed && (
                <>
                  {list.length === 0 ? (
                    <p className="px-1 text-sm text-neutral-400">{EMPTY_TEXT[h]}</p>
                  ) : (
                    <List tasks={list} onOpen={setOpenId} showMove />
                  )}
                  <button
                    onClick={() => {
                      chooseTarget(h)
                      inputRef.current?.focus()
                      inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                    }}
                    className="mt-1 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-neutral-500 hover:text-brand-700 dark:hover:text-brand-500"
                  >
                    <Plus className="size-4 text-brand-600" /> Přidat úkol
                  </button>
                </>
              )}
            </section>
          )
        })
      )}

      <TaskSheet taskId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

/** Přepínač vlastnosti nového úkolu (Společný, Pracovní). */
function Pill({
  active,
  onClick,
  icon,
  activeClass,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  activeClass: string
  title: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium ring-1 ${
        active ? activeClass : 'text-neutral-600 ring-neutral-300 dark:text-neutral-300 dark:ring-neutral-700'
      }`}
    >
      {icon}
      {children}
    </button>
  )
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
