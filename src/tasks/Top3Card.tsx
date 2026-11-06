import { useState } from 'react'
import { Link } from 'react-router'
import { Card } from '../components/ui'
import { TaskRow } from './TaskRow'
import { TaskSheet } from './TaskSheet'
import { useTasks } from './TasksProvider'

/** Karta na Dnes: Top 3 úkoly (ručně vybrané hvězdičkou + po termínu / na dnes). */
export function Top3Card() {
  const { top3, tasks, isMine } = useTasks()
  const [openId, setOpenId] = useState<string | null>(null)
  const openCount = tasks.filter((t) => !t.done_at && isMine(t)).length

  return (
    <Card title="Top 3 na dnes">
      {top3.length === 0 ? (
        <p className="mb-2 text-neutral-500">
          {openCount ? 'Na dnes nic naléhavého. Hvězdičkou u úkolu si vybereš, co chceš dnes udělat.' : 'Žádné úkoly.'}
        </p>
      ) : (
        <ul className="-mx-2 mb-2 divide-y divide-neutral-100 dark:divide-neutral-800">
          {top3.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={() => setOpenId(t.id)} />
          ))}
        </ul>
      )}
      <Link to="/planovac/ukoly" className="text-sm font-medium text-brand-700 dark:text-brand-500">
        {openCount ? `Všechny moje úkoly (${openCount}) →` : 'Přidat úkol →'}
      </Link>
      <TaskSheet taskId={openId} onClose={() => setOpenId(null)} />
    </Card>
  )
}
