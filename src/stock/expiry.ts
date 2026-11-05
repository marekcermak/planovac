import { TIME_ZONE } from '../lib/date'

const isoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const shortFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', day: 'numeric', month: 'numeric' })
const fullFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', day: 'numeric', month: 'numeric', year: 'numeric' })

/** Dnešní datum v Praze jako 'YYYY-MM-DD'. */
export function todayIso(): string {
  return isoFmt.format(new Date())
}

function utc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  return new Date(utc(iso) + days * 86_400_000).toISOString().slice(0, 10)
}

/** Počet dní do expirace (záporné = prošlé). null = bez expirace. */
export function daysLeft(expiresOn: string | null, today = todayIso()): number | null {
  if (!expiresOn) return null
  return Math.round((utc(expiresOn) - utc(today)) / 86_400_000)
}

export type ExpiryLevel = 'expired' | 'soon' | 'ok' | 'none'

export function expiryLevel(days: number | null, warnDays: number): ExpiryLevel {
  if (days === null) return 'none'
  if (days < 0) return 'expired'
  if (days <= warnDays) return 'soon'
  return 'ok'
}

const LEVEL_RANK: Record<ExpiryLevel, number> = { expired: 3, soon: 2, ok: 1, none: 0 }

export function worstLevel(levels: ExpiryLevel[]): ExpiryLevel | null {
  if (levels.length === 0) return null
  return levels.reduce((a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a))
}

/** Barvy štítku podle expirace (světlý i tmavý režim). */
export const LEVEL_BADGE: Record<ExpiryLevel, string> = {
  expired: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  soon: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  ok: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  none: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
}

/** Barvy buňky mapy podle nejhorší položky v ní. */
export const LEVEL_CELL: Record<ExpiryLevel, string> = {
  expired: 'bg-red-50 ring-red-400 dark:bg-red-950/60 dark:ring-red-700',
  soon: 'bg-orange-50 ring-orange-400 dark:bg-orange-950/60 dark:ring-orange-700',
  ok: 'bg-green-50 ring-green-400 dark:bg-green-950/50 dark:ring-green-800',
  none: 'bg-neutral-50 ring-neutral-300 dark:bg-neutral-900 dark:ring-neutral-700',
}

/** 1 den, 2 dny, 5 dní */
export function pluralDays(n: number): string {
  const a = Math.abs(n)
  if (a === 1) return `${n} den`
  if (a >= 2 && a <= 4) return `${n} dny`
  return `${n} dní`
}

/** „dnes“, „zítra“, „za 3 dny“, „prošlo včera“, „prošlo před 5 dny“ */
export function expiryText(days: number | null): string {
  if (days === null) return 'bez data'
  if (days === 0) return 'dnes'
  if (days === 1) return 'zítra'
  if (days > 1 && days <= 14) return `za ${pluralDays(days)}`
  if (days > 14) return '' // u dlouhé trvanlivosti stačí datum
  if (days === -1) return 'prošlo včera'
  return `prošlo před ${-days} dny`
}

export function formatDate(iso: string | null, withYear = false): string {
  if (!iso) return ''
  return (withYear ? fullFmt : shortFmt).format(new Date(utc(iso)))
}

const qtyFmt = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 3 })

export function formatQty(quantity: number, unit: string): string {
  return `${qtyFmt.format(quantity)} ${unit}`
}

export const UNITS = ['ks', 'g', 'kg', 'ml', 'l', 'bal'] as const
export type Unit = (typeof UNITS)[number]
