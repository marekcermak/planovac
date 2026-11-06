import { Camera } from 'lucide-react'
import { Link } from 'react-router'
import { Card } from '../components/ui'
import { useJournal } from './JournalProvider'
import { QuickThoughtButton } from './QuickThought'

/** Dnes: rychlý zápis myšlenky + poslední zápisy z deníku. */
export function JournalCard() {
  const { entries, chapterById } = useJournal()
  const recent = entries.slice(0, 2)
  return (
    <Card
      title={
        <span className="flex items-baseline gap-2">
          <span className="flex-1">Deník</span>
          <Link to="/denik" className="text-sm font-normal text-brand-700 dark:text-brand-500">
            Otevřít →
          </Link>
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <QuickThoughtButton className="flex-1" />
        <Link
          to="/denik/novy?foto=1"
          aria-label="Vyfotit poznámky"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-4 font-medium ring-1 ring-neutral-300 dark:bg-neutral-800 dark:ring-neutral-700"
        >
          <Camera className="size-5" />
        </Link>
      </div>
      {recent.length > 0 && (
        <ul className="space-y-2">
          {recent.map((e) => (
            <li key={e.id}>
              <Link to={`/denik/${e.id}`} className="block text-sm">
                <span className="text-neutral-500">{chapterById.get(e.chapter_id)?.icon} </span>
                <span className="line-clamp-2">{e.title || e.body.split('\n')[0] || 'Fotka'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
