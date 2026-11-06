import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { Sheet } from '../../components/Sheet'
import { useToast } from '../../components/Toast'
import { Button, Chip, ErrorText, Field } from '../../components/ui'
import { useHousehold } from '../../household/HouseholdProvider'
import { useJournal, type Chapter } from '../../journal/JournalProvider'

const ICONS = ['💭', '📓', '📚', '🎧', '📰', '💼', '❤️', '🌱', '✈️', '🍳', '🎯', '💡', '🙏', '🧠']

/** Správa vlastních kapitol: přidat, přejmenovat, ikona, sdílet, řadit, archivovat, smazat. */
export function ChaptersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { chapters, saveChapter } = useJournal()
  const { me } = useHousehold()
  const toast = useToast()
  const [editing, setEditing] = useState<Chapter | 'new' | null>(null)
  const mine = chapters.filter((c) => c.owner_id === me?.user_id)

  async function move(c: Chapter, dir: -1 | 1) {
    const i = mine.findIndex((x) => x.id === c.id)
    if (!mine[i + dir]) return
    const order = mine.slice()
    ;[order[i], order[i + dir]] = [order[i + dir], order[i]]
    try {
      await Promise.all(order.map((x, n) => (x.sort === n ? null : saveChapter(x.id, { name: x.name, sort: n }))))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Nepodařilo se uložit.', 'error')
    }
  }

  return (
    <Sheet open={open} onClose={() => (editing ? setEditing(null) : onClose())} title={editing ? (editing === 'new' ? 'Nová kapitola' : editing.name) : 'Kapitoly deníku'}>
      {editing ? (
        <ChapterForm chapter={editing === 'new' ? null : editing} nextSort={mine.length} onDone={() => setEditing(null)} />
      ) : (
        <div className="space-y-3">
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {mine.map((c, i) => (
              <li key={c.id} className="flex min-h-12 items-center gap-1">
                <button onClick={() => setEditing(c)} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left">
                  <span>{c.icon}</span>
                  <span className={`truncate font-medium ${c.archived ? 'text-neutral-400 line-through' : ''}`}>{c.name}</span>
                  <span className="text-xs text-neutral-500">{c.visibility === 'shared' ? 'sdílená' : 'jen já'}</span>
                </button>
                <button aria-label="Výš" disabled={i === 0} onClick={() => void move(c, -1)} className="flex size-10 items-center justify-center disabled:opacity-30">
                  <ArrowUp className="size-4" />
                </button>
                <button aria-label="Níž" disabled={i === mine.length - 1} onClick={() => void move(c, 1)} className="flex size-10 items-center justify-center disabled:opacity-30">
                  <ArrowDown className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <Button variant="secondary" className="w-full" onClick={() => setEditing('new')}>
            <Plus className="size-5" /> Nová kapitola
          </Button>
          {chapters.length > mine.length && (
            <p className="text-sm text-neutral-500">Sdílené kapitoly ostatních upravuje jejich autor.</p>
          )}
        </div>
      )}
    </Sheet>
  )
}

function ChapterForm({ chapter, nextSort, onDone }: { chapter: Chapter | null; nextSort: number; onDone: () => void }) {
  const { saveChapter, removeChapter, entries } = useJournal()
  const [name, setName] = useState(chapter?.name ?? '')
  const [icon, setIcon] = useState(chapter?.icon ?? '📓')
  const [visibility, setVisibility] = useState(chapter?.visibility ?? 'private')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const count = chapter ? entries.filter((e) => e.chapter_id === chapter.id).length : 0

  async function run(fn: () => Promise<unknown>) {
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
        void run(() => saveChapter(chapter?.id ?? null, { name: name.trim(), icon, visibility, ...(chapter ? {} : { sort: nextSort }) }))
      }}
    >
      <Field label="Název" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Z knih, Podcasty, Práce…" />
      <div className="flex flex-wrap gap-1">
        {ICONS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIcon(i)}
            aria-pressed={icon === i}
            className={`flex size-11 items-center justify-center rounded-xl text-2xl ${icon === i ? 'bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-800/30' : ''}`}
          >
            {i}
          </button>
        ))}
      </div>
      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Kdo ji vidí</span>
        <div className="flex gap-2">
          <Chip active={visibility === 'private'} onClick={() => setVisibility('private')}>
            Jen já
          </Chip>
          <Chip active={visibility === 'shared'} onClick={() => setVisibility('shared')}>
            Celá domácnost
          </Chip>
        </div>
        {visibility === 'shared' && <p className="mt-1 text-sm text-neutral-500">Ostatní ji budou číst a můžou do ní přidávat vlastní zápisy.</p>}
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
        {chapter ? 'Uložit' : 'Založit kapitolu'}
      </Button>
      {chapter && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="flex-1" disabled={busy} onClick={() => void run(() => saveChapter(chapter.id, { name: chapter.name, archived: !chapter.archived }))}>
            {chapter.archived ? 'Obnovit' : 'Archivovat'}
          </Button>
          {confirmDelete ? (
            <Button type="button" variant="danger" disabled={busy} onClick={() => void run(() => removeChapter(chapter.id))}>
              Smazat i {count} zápisů
            </Button>
          ) : (
            <Button type="button" variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Smazat
            </Button>
          )}
        </div>
      )}
    </form>
  )
}
