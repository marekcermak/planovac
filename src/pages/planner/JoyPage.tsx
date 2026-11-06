import { Search } from 'lucide-react'
import { useState } from 'react'
import { Sheet } from '../../components/Sheet'
import { Card } from '../../components/ui'
import { DayEntryForm } from '../../habits/HabitParts'
import { useHabits, type DayEntry } from '../../habits/HabitsProvider'
import { MOODS } from '../../habits/schedule'
import { fold } from '../../lib/text'
import { addDays, todayIso } from '../../stock/expiry'

const dayFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const shortFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' })
const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`)
const emoji = (m: number | null) => MOODS.find((x) => x.value === m)?.emoji ?? ''

/** Plánovač → Radost: denní záznamy (nálada + co mi udělalo radost), hledání, posledních 5 týdnů. Jen moje. */
export function JoyPage() {
  const { days, loading } = useHabits()
  const [query, setQuery] = useState('')
  const [editDate, setEditDate] = useState<string | null>(null)
  const today = todayIso()
  const q = fold(query.trim())
  const list = days.filter((d) => (d.joy || d.mood) && (!q || fold(d.joy ?? '').includes(q)))

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">Záznamy vidíš jen ty.</p>

      <Card title="Dnes">
        <DayEntryForm key={days.find((d) => d.date === today)?.id ?? 'new'} date={today} />
      </Card>

      <MoodStrip days={days} today={today} onPick={setEditDate} />

      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          placeholder="Hledat v radostech"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="block min-h-12 w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-10 text-base outline-none focus:border-brand-600 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      {list.length === 0 && !loading ? (
        <p className="text-neutral-500">{q ? 'Nic nenalezeno.' : 'Zatím žádné záznamy. Večer si sem zapiš, co ti udělalo radost.'}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => setEditDate(d.date)}
                className="flex w-full gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800"
              >
                <span className="w-9 shrink-0 text-2xl" aria-label={MOODS.find((m) => m.value === d.mood)?.label}>
                  {emoji(d.mood)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-neutral-500 first-letter:uppercase">{dayFmt.format(asDate(d.date))}</span>
                  {d.joy ? <span className="block whitespace-pre-line">{d.joy}</span> : <span className="text-neutral-400">bez zápisu</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={editDate !== null} onClose={() => setEditDate(null)} title={editDate ? dayFmt.format(asDate(editDate)) : ''}>
        {editDate && <DayEntryForm key={days.find((d) => d.date === editDate)?.id ?? 'new'} date={editDate} />}
      </Sheet>
    </div>
  )
}

/** Posledních 5 týdnů po dnech: smajlík nálady (emoji nese význam, ne barva), ťuknutí = zápis za ten den. */
function MoodStrip({ days, today, onPick }: { days: DayEntry[]; today: string; onPick: (d: string) => void }) {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const dow = (() => {
    const d = asDate(today).getUTCDay()
    return d === 0 ? 7 : d
  })()
  const start = addDays(today, -(dow - 1) - 28)
  const cells = Array.from({ length: 35 }, (_, i) => addDays(start, i))
  const rated = cells.map((c) => byDate.get(c)?.mood).filter((m): m is number => !!m)
  const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null

  return (
    <Card
      title={
        <span className="flex items-baseline gap-2">
          <span className="flex-1">Posledních 5 týdnů</span>
          {avg !== null && <span className="text-sm font-normal text-neutral-500">průměr {avg.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}</span>}
        </span>
      }
    >
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500">
        {['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'].map((d) => (
          <span key={d}>{d}</span>
        ))}
        {cells.map((c) => {
          const e = byDate.get(c)
          const future = c > today
          return (
            <button
              key={c}
              disabled={future}
              onClick={() => onPick(c)}
              title={`${shortFmt.format(asDate(c))}${e?.joy ? ` – ${e.joy.slice(0, 80)}` : ''}`}
              className={`flex aspect-square items-center justify-center rounded-lg text-xl ${
                future ? 'opacity-30' : 'bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-800/60 dark:hover:bg-neutral-800'
              } ${c === today ? 'ring-2 ring-brand-600' : ''}`}
            >
              {e?.mood ? emoji(e.mood) : e?.joy ? '✎' : <span className="text-xs text-neutral-400">{Number(c.slice(8))}</span>}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
