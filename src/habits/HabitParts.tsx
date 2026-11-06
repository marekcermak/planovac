import { Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Button, Chip, ErrorText } from '../components/ui'
import { addDays, todayIso } from '../stock/expiry'
import { useHabits, type Habit } from './HabitsProvider'
import { doneDates, doneToday, isScheduled, MOODS, scheduleText, streak, streakText, weekCount, weekStart } from './schedule'

const textareaClass =
  'block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 dark:border-neutral-700 dark:bg-neutral-900'

/**
 * Řádek návyku na dnešek. „Jen odškrtnout“ = ťuknutí přepne dnešek;
 * „zápis“ (sport) = otevře výběr druhu a poznámky, datum se doplní samo.
 */
export function HabitRow({ habit, link = true }: { habit: Habit; link?: boolean }) {
  const { logsOf, addLog, removeLog } = useHabits()
  const toast = useToast()
  const [logging, setLogging] = useState(false)
  const today = todayIso()
  const logs = logsOf(habit.id)
  const dates = doneDates(logs)
  const todayLogs = logs.filter((l) => l.date === today)
  const done = doneToday(habit, dates, today)
  const s = streak(habit, dates, today)

  async function tap() {
    if (habit.kind === 'activity') return setLogging(true)
    try {
      if (todayLogs.length) await Promise.all(todayLogs.map((l) => removeLog(l.id)))
      else await addLog(habit.id)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Nepodařilo se uložit.', 'error')
    }
  }

  const sub = [
    habit.schedule === 'per_week' ? `${weekCount(dates, today)}/${habit.per_week} tento týden` : scheduleText(habit),
    s.value > 0 ? `série ${streakText(s)}` : null,
    todayLogs.length && habit.kind === 'activity'
      ? `dnes: ${todayLogs.map((l) => l.activity_type ?? 'zapsáno').join(', ')}`
      : null,
  ].filter(Boolean)

  const label = (
    <span className="min-w-0 flex-1">
      <span className="block font-medium">
        <span className="mr-1.5">{habit.icon}</span>
        {habit.name}
      </span>
      <span className="block text-sm text-neutral-500">{sub.join(' · ')}</span>
    </span>
  )

  return (
    <li className="flex min-h-14 items-center gap-2 py-1">
      {link ? (
        <Link to={`/planovac/navyky/${habit.id}`} className="min-w-0 flex-1">
          {label}
        </Link>
      ) : (
        label
      )}
      <button
        onClick={() => void tap()}
        aria-label={habit.kind === 'activity' ? `Zapsat: ${habit.name}` : done ? `Vrátit: ${habit.name}` : `Splněno: ${habit.name}`}
        aria-pressed={todayLogs.length > 0}
        className={`flex size-12 shrink-0 items-center justify-center rounded-full ring-2 ${
          todayLogs.length > 0
            ? 'bg-brand-700 text-white ring-brand-700'
            : done
              ? 'text-brand-700 ring-brand-700 dark:text-brand-500'
              : 'text-neutral-400 ring-neutral-300 dark:ring-neutral-600'
        }`}
      >
        {habit.kind === 'activity' && todayLogs.length === 0 ? <Plus className="size-6" /> : <Check className="size-6" />}
      </button>
      <ActivitySheet habit={habit} open={logging} onClose={() => setLogging(false)} />
    </li>
  )
}

/** Zápis aktivity: druh (z nastavených, nebo vlastní) + poznámka. Datum = dnes. */
export function ActivitySheet({ habit, open, onClose }: { habit: Habit; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={`${habit.icon} ${habit.name}`}>
      {open && <ActivityForm habit={habit} onDone={onClose} />}
    </Sheet>
  )
}

function ActivityForm({ habit, onDone }: { habit: Habit; onDone: () => void }) {
  const { addLog, logsOf } = useHabits()
  const toast = useToast()
  // Naposledy použitý druh předvybrat.
  const lastType = logsOf(habit.id).find((l) => l.activity_type)?.activity_type ?? ''
  const [type, setType] = useState(habit.activity_types.includes(lastType) ? lastType : (habit.activity_types[0] ?? ''))
  const [custom, setCustom] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = custom.trim() || type

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await addLog(habit.id, { activity_type: chosen || null, note })
      toast(`${habit.icon} ${chosen || habit.name} zapsáno`)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se uložit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {habit.activity_types.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {habit.activity_types.map((t) => (
            <Chip
              key={t}
              active={!custom.trim() && type === t}
              onClick={() => {
                setType(t)
                setCustom('')
              }}
            >
              {t}
            </Chip>
          ))}
        </div>
      )}
      <input
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        maxLength={40}
        placeholder={habit.activity_types.length ? 'Něco jiného…' : 'Co (nepovinné)'}
        className="block min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base outline-none focus:border-brand-600 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <textarea
        rows={3}
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Poznámka (kde, s kým, jak to šlo…)"
        className={textareaClass}
      />
      <ErrorText>{error}</ErrorText>
      <Button className="w-full" disabled={busy} onClick={() => void save()}>
        Zapsat na dnes
      </Button>
    </div>
  )
}

const cellFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' })

/**
 * Kalendář plnění: sloupec = týden (po–ne), poslední `weeks` týdnů. Splněno = plná barva,
 * naplánováno a nesplněno = šedá, nenaplánováno / budoucnost = obrys. Popisek dne v title.
 */
export function Heatmap({ habit, weeks = 17 }: { habit: Habit; weeks?: number }) {
  const { logsOf } = useHabits()
  const today = todayIso()
  const logs = logsOf(habit.id)
  const byDate = new Map<string, string[]>()
  for (const l of logs) byDate.set(l.date, [...(byDate.get(l.date) ?? []), l.activity_type ?? '✓'])
  const first = addDays(weekStart(today), -7 * (weeks - 1))
  const created = habit.created_at.slice(0, 10)
  const cols = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)))

  return (
    <div>
      <div className="flex gap-[2px]" role="img" aria-label={`Kalendář plnění: ${habit.name}`}>
        {cols.map((col) => (
          <div key={col[0]} className="flex flex-1 flex-col gap-[2px]">
            {col.map((d) => {
              const done = byDate.get(d)
              const future = d > today
              const expected = !future && d >= created && habit.schedule !== 'per_week' && isScheduled(habit, d)
              return (
                <span
                  key={d}
                  title={`${cellFmt.format(new Date(`${d}T12:00:00Z`))}${done ? ` – ${done.join(', ')}` : ''}`}
                  className={`aspect-square w-full rounded-[2px] ${
                    done
                      ? 'bg-brand-600'
                      : expected
                        ? 'bg-neutral-200 dark:bg-neutral-700'
                        : future
                          ? ''
                          : 'bg-neutral-100 dark:bg-neutral-800/60'
                  } ${d === today ? 'ring-2 ring-neutral-900 dark:ring-white' : ''}`}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-[2px] bg-brand-600" /> splněno
        </span>
        {habit.schedule !== 'per_week' && (
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-[2px] bg-neutral-200 dark:bg-neutral-700" /> nesplněno
          </span>
        )}
        <span className="ml-auto">posledních {weeks} týdnů</span>
      </div>
    </div>
  )
}

/** Nálada (smajlíci 1–5) + „Co mi dnes udělalo radost“. */
export function DayEntryForm({ date, onSaved }: { date: string; onSaved?: () => void }) {
  const { dayOf, saveDay } = useHabits()
  const toast = useToast()
  const entry = dayOf(date)
  const [joy, setJoy] = useState(entry?.joy ?? '')
  const [busy, setBusy] = useState(false)
  const dirty = joy.trim() !== (entry?.joy ?? '').trim()

  async function save(patch: { mood?: number | null; joy?: string | null }, quiet = false) {
    setBusy(true)
    try {
      await saveDay(date, patch)
      if (!quiet) toast('Uloženo')
      onSaved?.()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Nepodařilo se uložit.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-1" role="radiogroup" aria-label="Nálada">
        {MOODS.map((m) => {
          const active = entry?.mood === m.value
          return (
            <button
              key={m.value}
              role="radio"
              aria-checked={active}
              aria-label={m.label}
              title={m.label}
              disabled={busy}
              // Rozepsaný text uložit zároveň (formulář se po založení záznamu znovu načte).
              onClick={() => void save({ mood: active ? null : m.value, ...(dirty ? { joy: joy.trim() || null } : {}) }, true)}
              className={`flex size-12 items-center justify-center rounded-full text-3xl transition ${
                active ? 'scale-110 bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-800/30' : entry?.mood ? 'opacity-40' : ''
              }`}
            >
              {m.emoji}
            </button>
          )
        })}
      </div>
      <textarea
        rows={3}
        maxLength={4000}
        value={joy}
        onChange={(e) => setJoy(e.target.value)}
        placeholder="Co mi dnes udělalo radost?"
        className={textareaClass}
      />
      {dirty && (
        <Button className="w-full" disabled={busy} onClick={() => void save({ joy: joy.trim() || null })}>
          Uložit
        </Button>
      )}
    </div>
  )
}
