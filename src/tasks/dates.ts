import { fold } from '../lib/text'
import { addDays, daysLeft, todayIso } from '../stock/expiry'

const WEEKDAYS: [string[], number][] = [
  [['po', 'pondeli', 'pondělí'], 1],
  [['ut', 'út', 'utery', 'úterý'], 2],
  [['st', 'streda', 'středa', 'stredu', 'středu'], 3],
  [['ct', 'čt', 'ctvrtek', 'čtvrtek'], 4],
  [['pa', 'pá', 'patek', 'pátek'], 5],
  [['so', 'sobota', 'sobotu'], 6],
  [['ne', 'nedele', 'neděle', 'nedeli', 'neděli'], 7],
]

/** ISO den v týdnu (1 = pondělí) pro datum YYYY-MM-DD. */
function isoDow(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

/**
 * Rychlé zadání úkolu: termín a priorita na konci textu.
 * „Zavolat do školky zítra“, „Koupit dárek pá“, „Daně 15.3.“, „Opravit kohoutek !“
 */
export function parseQuickTask(raw: string, today = todayIso()): { title: string; due: string | null; important: boolean } {
  let words = raw.trim().split(/\s+/)
  let due: string | null = null
  let important = false

  for (let guard = 0; guard < 3 && words.length > 1; guard++) {
    const last = words[words.length - 1]
    const f = fold(last)
    const prev = words.length > 2 ? fold(words[words.length - 2]) : ''
    if (last === '!' || last === '!!') {
      important = true
      words = words.slice(0, -1)
      continue
    }
    if (due) break
    if (f === 'dnes') due = today
    else if (f === 'zitra') due = addDays(today, 1)
    else if (f === 'pozitri') due = addDays(today, 2)
    else {
      const wd = WEEKDAYS.find(([names]) => names.some((n) => fold(n) === f))
      const m = last.match(/^(\d{1,2})\.\s?(\d{1,2})\.(\d{4})?$/)
      if (wd) {
        const diff = (wd[1] - isoDow(today) + 7) % 7 || 7
        due = addDays(today, diff)
      } else if (m) {
        const [y] = today.split('-').map(Number)
        const day = Number(m[1])
        const month = Number(m[2])
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          let year = m[3] ? Number(m[3]) : y
          let iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          if (!m[3] && iso < today) {
            year += 1
            iso = `${year}-${iso.slice(5)}`
          }
          due = iso
        }
      }
    }
    if (!due) break
    words = words.slice(0, -1)
    // „v pátek“, „do zítra“ → zahodit i předložku
    if (words.length > 1 && ['v', 've', 'do', 'na'].includes(prev)) words = words.slice(0, -1)
  }
  return { title: words.join(' '), due, important }
}

const shortFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' })

/** „dnes“, „zítra“, „včera“, „st 12. 11.“ */
export function dueLabel(due: string | null): string {
  if (!due) return ''
  const d = daysLeft(due)!
  if (d === 0) return 'dnes'
  if (d === 1) return 'zítra'
  if (d === -1) return 'včera'
  return shortFmt.format(new Date(`${due}T12:00:00Z`))
}

export type DueGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none'

export const GROUP_LABEL: Record<DueGroup, string> = {
  overdue: 'Po termínu',
  today: 'Dnes',
  tomorrow: 'Zítra',
  week: 'Příštích 7 dní',
  later: 'Později',
  none: 'Bez termínu',
}

export function dueGroup(due: string | null): DueGroup {
  if (!due) return 'none'
  const d = daysLeft(due)!
  if (d < 0) return 'overdue'
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d <= 7) return 'week'
  return 'later'
}

export const RECURRENCE_LABEL: Record<string, string> = {
  daily: 'Každý den',
  weekdays: 'Každý pracovní den',
  weekly: 'Každý týden',
  monthly: 'Každý měsíc',
  yearly: 'Každý rok',
}
