import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useToast } from '../../components/Toast'
import { Button, Card, Chip, ErrorText } from '../../components/ui'
import { HabitFormSheet, SPORT_TEMPLATE } from '../../habits/HabitForm'
import { Heatmap, HabitRow } from '../../habits/HabitParts'
import { useHabits, type HabitLog } from '../../habits/HabitsProvider'
import { doneDates, scheduleText, streak, streakText } from '../../habits/schedule'
import { todayIso } from '../../stock/expiry'
import { PinButton } from '../../display/PinButton'

/** Plánovač → Návyky: dnešní odškrtávání + kalendář plnění každého návyku. Jen moje (soukromé). */
export function HabitsPage() {
  const { habits, loading, error } = useHabits()
  const [form, setForm] = useState<null | 'new' | 'sport'>(null)
  const [showArchived, setShowArchived] = useState(false)
  const active = habits.filter((h) => !h.archived)
  const archived = habits.filter((h) => h.archived)

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">Návyky vidíš jen ty.</p>
      <ErrorText>{error}</ErrorText>

      {active.length === 0 && !loading ? (
        <Card>
          <p className="mb-3 text-neutral-600 dark:text-neutral-400">
            Zatím žádné návyky. Začni sportem – zapíšeš druh a poznámku, datum se doplní samo.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setForm('sport')}>🏃 Založit Sport</Button>
            <Button variant="secondary" onClick={() => setForm('new')}>
              <Plus className="size-5" /> Jiný návyk
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {active.map((h) => (
            <Card key={h.id}>
              <ul className="-mt-1 mb-3">
                <HabitRow habit={h} />
              </ul>
              <Heatmap habit={h} />
            </Card>
          ))}
          <Button variant="secondary" onClick={() => setForm('new')}>
            <Plus className="size-5" /> Nový návyk
          </Button>
        </>
      )}

      {archived.length > 0 && (
        <div>
          <Chip active={showArchived} onClick={() => setShowArchived((v) => !v)}>
            Archiv ({archived.length})
          </Chip>
          {showArchived && (
            <ul className="mt-2 space-y-1">
              {archived.map((h) => (
                <li key={h.id}>
                  <Link to={`/planovac/navyky/${h.id}`} className="block rounded-xl px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                    {h.icon} {h.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <HabitFormSheet
        open={form !== null}
        habit={null}
        template={form === 'sport' ? SPORT_TEMPLATE : undefined}
        onClose={() => setForm(null)}
      />
    </div>
  )
}

const monthFmt = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' })
const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`)

/** Detail návyku: statistika, kalendář a celá historie zápisů s poznámkami (k čemu se vracet). */
export function HabitDetailPage() {
  const { id } = useParams()
  const { habits, logsOf, removeLog, loading } = useHabits()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const habit = habits.find((h) => h.id === id)

  if (!habit) {
    return (
      <div>
        <BackLink />
        <p className="text-neutral-500">{loading ? 'Načítám…' : 'Návyk nenalezen.'}</p>
      </div>
    )
  }

  const logs = logsOf(habit.id)
  const today = todayIso()
  const month = today.slice(0, 7)
  const dates = doneDates(logs)
  const s = streak(habit, dates, today)
  const thisMonth = logs.filter((l) => l.date.startsWith(month))
  const year = logs.filter((l) => l.date.startsWith(today.slice(0, 4)))

  // Rozpad podle druhu (tento měsíc a letos).
  const breakdown = (list: HabitLog[]) => {
    const m = new Map<string, number>()
    for (const l of list) m.set(l.activity_type ?? 'bez druhu', (m.get(l.activity_type ?? 'bez druhu') ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }

  // Historie po měsících.
  const byMonth = new Map<string, HabitLog[]>()
  for (const l of logs) byMonth.set(l.date.slice(0, 7), [...(byMonth.get(l.date.slice(0, 7)) ?? []), l])

  return (
    <div className="space-y-4">
      <BackLink />
      <div className="flex items-start gap-3">
        <h2 className="flex-1 text-xl font-bold">
          {habit.icon} {habit.name}
          <span className="block text-sm font-normal text-neutral-500">
            {scheduleText(habit)}
            {habit.archived && ' · archivováno'}
          </span>
        </h2>
        <button
          onClick={() => setEditing(true)}
          aria-label="Upravit návyk"
          className="flex size-11 items-center justify-center rounded-full ring-1 ring-neutral-300 dark:ring-neutral-700"
        >
          <Pencil className="size-5" />
        </button>
      </div>

      {!habit.archived && (
        <Card>
          <ul className="-my-1">
            <HabitRow habit={habit} link={false} />
          </ul>
        </Card>
      )}

      <PinButton kind="habit" refId={habit.id} text={`${habit.icon} ${habit.name}`} />
      <div className="grid grid-cols-3 gap-2">
        <Stat value={streakText(s)} label="série" />
        <Stat value={String(thisMonth.length)} label="tento měsíc" />
        <Stat value={String(year.length)} label="letos" />
      </div>

      <Card>
        <Heatmap habit={habit} weeks={26} />
      </Card>

      {habit.kind === 'activity' && year.length > 0 && (
        <Card title="Podle druhu">
          <table className="w-full text-sm">
            <thead className="text-neutral-500">
              <tr>
                <th className="py-1 text-left font-normal">Druh</th>
                <th className="py-1 text-right font-normal">Tento měsíc</th>
                <th className="py-1 text-right font-normal">Letos</th>
              </tr>
            </thead>
            <tbody>
              {breakdown(year).map(([t, n]) => (
                <tr key={t} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-1.5">{t}</td>
                  <td className="py-1.5 text-right tabular-nums">{breakdown(thisMonth).find(([x]) => x === t)?.[1] ?? 0}</td>
                  <td className="py-1.5 text-right tabular-nums">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <section>
        <h3 className="mb-2 font-semibold">Historie</h3>
        {logs.length === 0 && <p className="text-neutral-500">Zatím žádné zápisy.</p>}
        {[...byMonth.entries()].map(([m, list]) => (
          <div key={m} className="mb-4">
            <h4 className="mb-1 text-sm font-semibold text-neutral-500 first-letter:uppercase">
              {monthFmt.format(asDate(`${m}-01`))} · {list.length}×
            </h4>
            <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
              {list.map((l) => (
                <li key={l.id} className="flex items-start gap-3 px-3 py-2">
                  <span className="w-20 shrink-0 pt-0.5 text-sm text-neutral-500">{dayFmt.format(asDate(l.date))}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{l.activity_type ?? '✓'}</span>
                    {l.note && <span className="block text-sm whitespace-pre-line text-neutral-600 dark:text-neutral-400">{l.note}</span>}
                  </span>
                  <button
                    aria-label="Smazat zápis"
                    onClick={() => void removeLog(l.id).catch((e: Error) => toast(e.message, 'error'))}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <HabitFormSheet open={editing} habit={habit} onClose={() => setEditing(false)} />
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 text-center ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/planovac/navyky" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-neutral-500">
      <ChevronLeft className="size-4" /> Návyky
    </Link>
  )
}
