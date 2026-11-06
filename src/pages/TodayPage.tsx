import { Link } from 'react-router'
import { InstallHint } from '../components/InstallHint'
import { Avatar, Card, PageHeader } from '../components/ui'
import { useHousehold } from '../household/HouseholdProvider'
import { formatLongDate, greeting } from '../lib/date'
import { CookIdeasCard } from '../kitchen/CookIdeasCard'
import { RescueCard } from '../stock/RescueCard'
import { StockSummary } from '../stock/StockSummary'
import { Top3Card } from '../tasks/Top3Card'
import { DayCard, HabitsTodayCard } from '../habits/TodayCards'

export function TodayPage() {
  const { household, members, me } = useHousehold()

  return (
    <>
      <PageHeader title={`${greeting()}, ${me?.display_name ?? ''}`} subtitle={formatLongDate()} />
      <div className="mb-4">
        <InstallHint />
      </div>
      <div className="mb-4">
        <StockSummary />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Top3Card />
        <RescueCard />
        <CookIdeasCard />
        <HabitsTodayCard />
        <DayCard />
        <Card title="Domácnost">
          <Link to="/vice/domacnost" className="block">
            <p className="mb-3 font-medium">{household?.name}</p>
            <ul className="flex flex-wrap gap-3">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-2">
                  <Avatar name={m.display_name} color={m.color} size="sm" />
                  <span>{m.display_name}</span>
                </li>
              ))}
            </ul>
            {members.length < 2 && (
              <p className="mt-3 text-sm font-medium text-brand-700 dark:text-brand-500">Pozvi partnera →</p>
            )}
          </Link>
        </Card>
      </div>
    </>
  )
}
