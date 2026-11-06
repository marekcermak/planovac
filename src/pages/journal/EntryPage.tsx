import { ChevronLeft, ListChecks, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Sheet } from '../../components/Sheet'
import { useToast } from '../../components/Toast'
import { Button, ErrorText } from '../../components/ui'
import { useHousehold } from '../../household/HouseholdProvider'
import { SOURCE_LABEL, useJournal, type Entry } from '../../journal/JournalProvider'
import { JOURNAL_BUCKET, useSignedUrls } from '../../lib/images'
import { dueLabel, parseQuickTask } from '../../tasks/dates'
import { PinButton } from '../../display/PinButton'
import { useTasks } from '../../tasks/TasksProvider'

const dateFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** Odkazy v textu jako klikací (jinak prostý text se zachovanými řádky). */
function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all text-brand-700 underline dark:text-brand-500">
        {part}
      </a>
    ) : (
      part
    ),
  )
}

export function EntryPage() {
  const { id } = useParams()
  const { entries, loading } = useJournal()
  const entry = entries.find((e) => e.id === id)
  if (!entry) {
    return (
      <div>
        <Back />
        <p className="text-neutral-500">{loading ? 'Načítám…' : 'Zápis nenalezen.'}</p>
      </div>
    )
  }
  return <EntryDetail key={entry.id} entry={entry} />
}

function Back({ chapterId }: { chapterId?: string }) {
  return (
    <Link to={chapterId ? `/denik?kapitola=${chapterId}` : '/denik'} className="mb-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-neutral-500">
      <ChevronLeft className="size-4" /> Deník
    </Link>
  )
}

function EntryDetail({ entry }: { entry: Entry }) {
  const { chapterById, updateEntry, removeEntry } = useJournal()
  const { me, members } = useHousehold()
  const navigate = useNavigate()
  const toast = useToast()
  const urls = useSignedUrls(entry.photo_paths, JOURNAL_BUCKET)
  const [toTasks, setToTasks] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chapter = chapterById.get(entry.chapter_id)
  const mine = entry.owner_id === me?.user_id
  const author = !mine ? members.find((m) => m.user_id === entry.owner_id) : undefined

  async function remove() {
    try {
      await removeEntry(entry)
      toast('Zápis smazán')
      navigate(`/denik?kapitola=${entry.chapter_id}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se smazat.')
    }
  }

  return (
    <article className="max-w-2xl pb-6">
      <Back chapterId={entry.chapter_id} />
      <div className="mb-1 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-neutral-500 first-letter:uppercase">
            {dateFmt.format(new Date(`${entry.entry_date}T12:00:00Z`))}
            {chapter && ` · ${chapter.icon} ${chapter.name}`}
            {author && ` · ${author.display_name}`}
          </p>
          {entry.title && <h1 className="text-2xl font-bold tracking-tight">{entry.title}</h1>}
        </div>
        {mine && (
          <>
            <button
              aria-label={entry.pinned ? 'Odepnout' : 'Připnout'}
              onClick={() => void updateEntry(entry.id, { pinned: !entry.pinned }).catch((e: Error) => toast(e.message, 'error'))}
              className="flex size-11 items-center justify-center rounded-full ring-1 ring-neutral-300 dark:ring-neutral-700"
            >
              {entry.pinned ? <PinOff className="size-5" /> : <Pin className="size-5" />}
            </button>
            <Link
              to={`/denik/${entry.id}/upravit`}
              aria-label="Upravit"
              className="flex size-11 items-center justify-center rounded-full ring-1 ring-neutral-300 dark:ring-neutral-700"
            >
              <Pencil className="size-5" />
            </Link>
          </>
        )}
      </div>

      {(entry.source_type !== 'vlastni' || entry.source_ref) && (
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          {SOURCE_LABEL[entry.source_type]}
          {entry.source_ref && <>: {linkify(entry.source_ref)}</>}
        </p>
      )}

      {entry.body && <div className="mt-3 text-lg leading-relaxed whitespace-pre-line">{linkify(entry.body)}</div>}

      {entry.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {entry.tags.map((t) => (
            <Link key={t} to={`/denik?stitek=${encodeURIComponent(t)}`} className="rounded-full bg-neutral-100 px-3 py-1 text-sm dark:bg-neutral-800">
              #{t}
            </Link>
          ))}
        </div>
      )}

      {entry.photo_paths.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {entry.photo_paths.map((p) =>
            urls[p] ? (
              <a key={p} href={urls[p]} target="_blank" rel="noreferrer">
                <img src={urls[p]} alt="Fotka u zápisu" className="aspect-square w-full rounded-xl object-cover" />
              </a>
            ) : (
              <span key={p} className="aspect-square rounded-xl bg-neutral-100 dark:bg-neutral-800" />
            ),
          )}
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        {entry.body.trim() && (
          <Button variant="secondary" onClick={() => setToTasks(true)}>
            <ListChecks className="size-5" /> Řádky na úkoly
          </Button>
        )}
        <PinButton kind="journal" refId={entry.id} text={entry.title || entry.body.split('\n').find((l) => l.trim()) || ''} />
        {mine &&
          (confirmDelete ? (
            <Button variant="danger" onClick={() => void remove()}>
              Opravdu smazat
            </Button>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-5" /> Smazat
            </Button>
          ))}
      </div>
      <ErrorText>{error}</ErrorText>

      <Sheet open={toTasks} onClose={() => setToTasks(false)} title="Udělat z řádků úkoly">
        {toTasks && <LinesToTasks entry={entry} privateDefault={chapter?.visibility !== 'shared'} onDone={() => setToTasks(false)} />}
      </Sheet>
    </article>
  )
}

/** Každý neprázdný řádek zápisu jako návrh úkolu (termín na konci řádku se rozpozná, „zítra“, „15. 11.“). */
function LinesToTasks({ entry, privateDefault, onDone }: { entry: Entry; privateDefault: boolean; onDone: () => void }) {
  const { add } = useTasks()
  const toast = useToast()
  const lines = entry.body
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ x]?\])\s*/i, '').trim())
    .filter((l) => l.length > 0 && l.length <= 200)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [isPrivate, setIsPrivate] = useState(privateDefault)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      for (const i of [...selected].sort((a, b) => a - b)) {
        const p = parseQuickTask(lines[i])
        await add({
          title: p.title || lines[i],
          due_date: p.due,
          priority: p.important ? 2 : 1,
          visibility: isPrivate ? 'private' : 'shared',
          notes: entry.title ? `Z deníku: ${entry.title}` : 'Z deníku',
        })
      }
      toast(`Úkolů vytvořeno: ${selected.size}`)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se vytvořit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {lines.map((l, i) => {
          const p = parseQuickTask(l)
          return (
            <li key={i}>
              <label className="flex min-h-12 items-center gap-3 py-1">
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-brand-700"
                  checked={selected.has(i)}
                  onChange={(e) =>
                    setSelected((s) => {
                      const n = new Set(s)
                      if (e.target.checked) n.add(i)
                      else n.delete(i)
                      return n
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  {p.title || l}
                  {p.due && <span className="ml-2 text-sm text-brand-700 dark:text-brand-500">{dueLabel(p.due)}</span>}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-5 accent-brand-700" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        <span>Jen pro mě (soukromé úkoly)</span>
      </label>
      <ErrorText>{error}</ErrorText>
      <Button className="w-full" disabled={busy || selected.size === 0} onClick={() => void create()}>
        Vytvořit úkoly ({selected.size})
      </Button>
    </div>
  )
}
