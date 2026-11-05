import { Link } from 'react-router'
import { daysLeft, pluralDays } from './expiry'
import { useStock } from './StockProvider'

/**
 * Přehled na Dnes místo notifikací (SPEC kap. 6): prošlé / dnes / do N dní / otevřené.
 * Ťuknutí otevře Sklad s odpovídajícím filtrem.
 */
export function StockSummary() {
  const { items, warnDays, loading } = useStock()
  if (loading || items.length === 0) return null

  let expired = 0
  let today = 0
  let soon = 0
  let opened = 0
  for (const i of items) {
    const d = daysLeft(i.expires_on)
    if (d !== null && d < 0) expired++
    else if (d === 0) today++
    else if (d !== null && d <= warnDays) soon++
    if (i.opened_on) opened++
  }

  const tiles = [
    { label: 'Prošlé', n: expired, filtr: 'prosle', tone: 'text-red-700 dark:text-red-400' },
    { label: 'Prochází dnes', n: today, filtr: 'dnes', tone: 'text-orange-700 dark:text-orange-400' },
    {
      label: warnDays <= 1 ? 'Zítra' : `Do ${pluralDays(warnDays)}`,
      n: soon,
      filtr: 'prochazi',
      tone: 'text-amber-700 dark:text-amber-400',
    },
    { label: 'Otevřené', n: opened, filtr: 'otevrene', tone: 'text-neutral-700 dark:text-neutral-300' },
  ]

  return (
    <div className="grid grid-cols-4 gap-2">
      {tiles.map((t) => (
        <Link
          key={t.filtr}
          to={`/sklad?filtr=${t.filtr}`}
          className="flex min-h-18 flex-col items-center justify-center rounded-2xl bg-white px-1 py-2 text-center ring-1 ring-neutral-200 active:scale-95 dark:bg-neutral-900 dark:ring-neutral-800"
        >
          <span className={`text-2xl font-bold tabular-nums ${t.n > 0 ? t.tone : 'text-neutral-300 dark:text-neutral-700'}`}>
            {t.n}
          </span>
          <span className="text-xs leading-tight text-neutral-500">{t.label}</span>
        </Link>
      ))}
    </div>
  )
}
