import { Link } from 'react-router'
import { Card } from '../components/ui'
import { todayIso } from '../stock/expiry'
import { HabitRow, DayEntryForm } from './HabitParts'
import { useHabits } from './HabitsProvider'
import { dueToday } from './schedule'

/** Dnes: moje návyky na dnešek, odškrtnutí jedním ťuknutím. */
export function HabitsTodayCard() {
  const { habits, loading } = useHabits()
  const list = dueToday(habits, todayIso())
  return (
    <Card title="Moje návyky">
      {list.length === 0 ? (
        <Link to="/planovac/navyky" className="block text-neutral-500">
          {loading ? 'Načítám…' : habits.length ? 'Na dnes nic naplánovaného.' : 'Zatím žádné návyky.'}{' '}
          <span className="font-medium text-brand-700 dark:text-brand-500">{habits.length ? 'Návyky →' : 'Založit sport →'}</span>
        </Link>
      ) : (
        <ul className="-my-1 divide-y divide-neutral-100 dark:divide-neutral-800">
          {list.map((h) => (
            <HabitRow key={h.id} habit={h} />
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Dnes: nálada + co mi dnes udělalo radost. */
export function DayCard() {
  const { dayOf } = useHabits()
  const today = todayIso()
  const entry = dayOf(today)
  return (
    <Card
      title={
        <span className="flex items-baseline gap-2">
          <span className="flex-1">Jaký byl den?</span>
          <Link to="/planovac/radost" className="text-sm font-normal text-brand-700 dark:text-brand-500">
            Historie →
          </Link>
        </span>
      }
    >
      <DayEntryForm key={entry?.id ?? 'new'} date={today} />
    </Card>
  )
}
