import { addDays } from '../stock/expiry'
import type { Habit, HabitLog } from './HabitsProvider'

export const MOODS: { value: number; emoji: string; label: string }[] = [
  { value: 1, emoji: '😞', label: 'Špatně' },
  { value: 2, emoji: '🙁', label: 'Nic moc' },
  { value: 3, emoji: '😐', label: 'Ujde to' },
  { value: 4, emoji: '🙂', label: 'Dobře' },
  { value: 5, emoji: '😄', label: 'Skvěle' },
]

export const DAY_NAMES = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne']

/** ISO den v týdnu (1 = pondělí). */
export function isoDow(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

/** Pondělí týdne, do kterého datum patří. */
export function weekStart(iso: string): string {
  return addDays(iso, 1 - isoDow(iso))
}

/** Je návyk naplánovaný na tento den? (per_week = kterýkoli den, dokud není splněno.) */
export function isScheduled(h: Habit, iso: string): boolean {
  if (h.schedule === 'days') return h.days.includes(isoDow(iso))
  return true
}

export function scheduleText(h: Habit): string {
  if (h.schedule === 'daily') return 'každý den'
  if (h.schedule === 'per_week') return `${h.per_week}× týdně`
  return h.days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d - 1])
    .join(', ')
}

/** Dny se zápisem pro návyk. */
export function doneDates(logs: HabitLog[]): Set<string> {
  return new Set(logs.map((l) => l.date))
}

/** Kolik zápisů (dní) v týdnu, kam patří datum. */
export function weekCount(dates: Set<string>, iso: string): number {
  const start = weekStart(iso)
  let n = 0
  for (let i = 0; i < 7; i++) if (dates.has(addDays(start, i))) n++
  return n
}

/**
 * Série: denní / vybrané dny = kolik naplánovaných dní v řadě je splněno (dnešek se nepočítá jako přerušení,
 * dokud neskončil); X× týdně = kolik týdnů v řadě byl cíl splněn (aktuální týden se přičte, když už je splněný).
 */
export function streak(h: Habit, dates: Set<string>, today: string): { value: number; unit: 'dní' | 'týdnů' } {
  if (h.schedule === 'per_week') {
    const target = h.per_week ?? 1
    let n = weekCount(dates, today) >= target ? 1 : 0
    let w = addDays(weekStart(today), -7)
    for (let i = 0; i < 520; i++) {
      if (weekCount(dates, w) < target) break
      n++
      w = addDays(w, -7)
    }
    return { value: n, unit: 'týdnů' }
  }
  let n = 0
  let d = today
  if (!dates.has(d)) d = addDays(d, -1)
  for (let i = 0; i < 3660; i++) {
    if (isScheduled(h, d)) {
      if (!dates.has(d)) break
      n++
    }
    d = addDays(d, -1)
  }
  return { value: n, unit: 'dní' }
}

/** Je pro dnešek hotovo? (per_week: týdenní cíl splněn, nebo dnes už zapsáno.) */
export function doneToday(h: Habit, dates: Set<string>, today: string): boolean {
  if (dates.has(today)) return true
  if (h.schedule === 'per_week') return weekCount(dates, today) >= (h.per_week ?? 1)
  return false
}

/** Návyky, které patří na dnešek (naplánované a nearchivované). */
export function dueToday(habits: Habit[], today: string): Habit[] {
  return habits.filter((h) => !h.archived && isScheduled(h, today))
}

/** „1 den“, „3 dny“, „7 dní“ / „1 týden“, „2 týdny“, „5 týdnů“ */
export function streakText(s: { value: number; unit: 'dní' | 'týdnů' }): string {
  const n = s.value
  if (s.unit === 'dní') return n === 1 ? '1 den' : n >= 2 && n <= 4 ? `${n} dny` : `${n} dní`
  return n === 1 ? '1 týden' : n >= 2 && n <= 4 ? `${n} týdny` : `${n} týdnů`
}
