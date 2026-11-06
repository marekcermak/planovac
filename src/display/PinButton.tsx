import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Button, Chip, ErrorText } from '../components/ui'
import { addDays, todayIso } from '../stock/expiry'
import { useDisplay, type PinKind, type PinUntil } from './DisplayProvider'

/**
 * „📟 Na displej“ (SPEC kap. 7): zkrácený text (max 60 znaků), platnost, max. 3 na člověka.
 * Zobrazí se, jen když je Živý obraz zapnutý.
 */
export function PinButton({
  kind,
  refId,
  text,
  className = '',
  variant = 'secondary',
  untilDate,
}: {
  kind: PinKind
  refId?: string | null
  text: string
  /** Výchozí platnost „do data“ (např. jídlo na zítřek). */
  untilDate?: string
  className?: string
  variant?: 'secondary' | 'ghost'
}) {
  const { enabled } = useDisplay()
  const [open, setOpen] = useState(false)
  if (!enabled) return null
  return (
    <>
      <Button type="button" variant={variant} className={className} onClick={() => setOpen(true)}>
        📟 Na displej
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Poslat na displej">
        {open && <PinForm kind={kind} refId={refId} initial={text} untilDate={untilDate} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  )
}

export function PinForm({
  kind,
  refId,
  initial,
  untilDate,
  onDone,
}: {
  kind: PinKind
  refId?: string | null
  initial: string
  untilDate?: string
  onDone: () => void
}) {
  const { myPins, pin } = useDisplay()
  const toast = useToast()
  const [text, setText] = useState(initial.replace(/\s+/g, ' ').trim().slice(0, 60))
  const [until, setUntil] = useState<PinUntil['kind']>(untilDate && untilDate > todayIso() ? 'date' : 'end_of_day')
  const [date, setDate] = useState(untilDate && untilDate > todayIso() ? untilDate : addDays(todayIso(), 7))
  const [replace, setReplace] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const full = myPins.length >= 3

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await pin({ kind, refId, text, until: { kind: until, date }, replaceSlot: full ? (replace ?? undefined) : undefined })
      toast('📟 Odesláno na displej')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se odeslat.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 flex text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <span className="flex-1">Text na displeji</span>
          <span className={text.length > 50 ? 'text-orange-600' : 'text-neutral-400'}>{text.length}/60</span>
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 60))}
          className="block min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base outline-none focus:border-brand-600 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Jak dlouho</span>
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={until === 'end_of_day'} onClick={() => setUntil('end_of_day')}>
            Do konce dne
          </Chip>
          <Chip active={until === 'until_removed'} onClick={() => setUntil('until_removed')}>
            Dokud neodeberu
          </Chip>
          <Chip active={until === 'date'} onClick={() => setUntil('date')}>
            Do data
          </Chip>
          {until === 'date' && (
            <input
              type="date"
              aria-label="Do kdy"
              min={todayIso()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-10 rounded-xl border border-neutral-300 bg-white px-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
          )}
        </div>
      </div>
      {full && (
        <div>
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Na displeji máš už 3 položky – kterou nahradit?</span>
          <div className="space-y-1">
            {myPins.map((p) => (
              <label key={p.id} className="flex min-h-11 items-center gap-3">
                <input type="radio" name="replace" className="size-5 accent-brand-700" checked={replace === p.slot} onChange={() => setReplace(p.slot)} />
                <span>{p.text}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      <Button className="w-full" disabled={busy || !text.trim() || (full && replace === null)} onClick={() => void submit()}>
        Odeslat na displej
      </Button>
    </div>
  )
}
