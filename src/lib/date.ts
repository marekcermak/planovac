export const TIME_ZONE = 'Europe/Prague'

const longDate = new Intl.DateTimeFormat('cs-CZ', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const hourFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: TIME_ZONE, hour: 'numeric', hourCycle: 'h23' })

/** „pondělí 2. listopadu“ */
export function formatLongDate(date: Date = new Date()): string {
  return longDate.format(date)
}

export function greeting(date: Date = new Date()): string {
  const h = Number(hourFmt.format(date))
  if (h < 10) return 'Dobré ráno'
  if (h < 18) return 'Dobrý den'
  return 'Dobrý večer'
}
