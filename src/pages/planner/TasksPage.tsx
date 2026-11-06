import { Plus, Users } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Button, Card, Chip, ErrorText } from '../../components/ui'
import { dueGroup, dueLabel, GROUP_LABEL, parseQuickTask, type DueGroup } from '../../tasks/dates'
import { TaskRow } from '../../tasks/TaskRow'
import { TaskSheet } from '../../tasks/TaskSheet'
import { useTasks, type Task } from '../../tasks/TasksProvider'

type Filter = 'mine' | 'all' | 'done'

const GROUPS: DueGroup[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none']

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
  const { tasks, loading, error, add, isMine } = useTasks()
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
  const byUrgency = (a: Task, b: Task) =>
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || b.priority - a.priority || a.created_at.localeCompare(b.created_at)

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
            {[parsed.due && `termín ${dueLabel(parsed.due)}`, parsed.important && 'vysoká priorita', isShared ? 'společný – vidíte oba' : 'jen pro mě']
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
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

      {visible.length === 0 && !loading ? (
        <Card>
          <p className="text-neutral-500">
            {filter === 'done'
              ? 'Za posledních 14 dní nic hotového.'
              : 'Žádné úkoly. Napiš nahoru, co je potřeba udělat – termín můžeš dopsat na konec („zítra“, „v pátek“, „15. 11.“), „!“ = důležité.'}
          </p>
        </Card>
      ) : filter === 'done' ? (
        <List tasks={visible.sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))} onOpen={setOpenId} />
      ) : (
        GROUPS.map((g) => {
          const list = visible.filter((t) => dueGroup(t.due_date) === g).sort(byUrgency)
          if (list.length === 0) return null
          return (
            <section key={g}>
              <h2 className={`mb-1.5 text-sm font-semibold ${g === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-neutral-500'}`}>
                {GROUP_LABEL[g]}
              </h2>
              <List tasks={list} onOpen={setOpenId} />
            </section>
          )
        })
      )}

      <TaskSheet taskId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

function List({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} onOpen={() => onOpen(t.id)} />
      ))}
    </ul>
  )
}
