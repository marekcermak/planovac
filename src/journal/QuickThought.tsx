import { Lightbulb } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Button, Chip, ErrorText } from '../components/ui'
import { useHousehold } from '../household/HouseholdProvider'
import { useJournal } from './JournalProvider'

const LAST_KEY = 'journal.quickChapter'

/** Tlačítko „Myšlenka“ – otevře prázdné pole, uložení jedním ťuknutím (SPEC 9a: zápis do 5 s). */
export function QuickThoughtButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" className={className} onClick={() => setOpen(true)}>
        <Lightbulb className="size-5" /> Myšlenka
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Myšlenka">
        {open && <QuickThoughtForm onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  )
}

function QuickThoughtForm({ onDone }: { onDone: () => void }) {
  const { chapters, saveEntry } = useJournal()
  const { me } = useHousehold()
  const toast = useToast()
  const mine = chapters.filter((c) => !c.archived && (c.owner_id === me?.user_id || c.visibility === 'shared'))
  const [chapterId, setChapterId] = useState(() => {
    let last: string | null = null
    try {
      last = localStorage.getItem(LAST_KEY)
    } catch {
      /* nevadí */
    }
    return mine.find((c) => c.id === last)?.id ?? mine.find((c) => c.name === 'Myšlenky')?.id ?? mine[0]?.id ?? ''
  })
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // iOS: fokus až po otevření panelu, ať se ukáže klávesnice
    const t = setTimeout(() => ref.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  async function save() {
    if (!body.trim() || !chapterId) return
    setBusy(true)
    setError(null)
    try {
      await saveEntry(null, { chapter_id: chapterId, body: body.trim() })
      try {
        localStorage.setItem(LAST_KEY, chapterId)
      } catch {
        /* nevadí */
      }
      toast('Uloženo do deníku')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se uložit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        ref={ref}
        rows={5}
        maxLength={50000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save()
        }}
        placeholder="Co tě napadlo?"
        className="block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {mine.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {mine.map((c) => (
            <Chip key={c.id} active={chapterId === c.id} onClick={() => setChapterId(c.id)}>
              {c.icon} {c.name}
            </Chip>
          ))}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      <Button className="w-full" disabled={busy || !body.trim() || !chapterId} onClick={() => void save()}>
        Uložit
      </Button>
    </div>
  )
}
