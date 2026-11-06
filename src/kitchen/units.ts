/** Zaokrouhlit přepočtené množství na rozumné číslo (0,333 → 0,33; 233,3 g → 235 g). */
export function roundQty(q: number): number {
  if (q >= 100) return Math.round(q / 5) * 5
  if (q >= 10) return Math.round(q)
  return Math.round(q * 100) / 100
}

const BASE: Record<string, [string, number]> = {
  g: ['g', 1],
  kg: ['g', 1000],
  ml: ['ml', 1],
  l: ['ml', 1000],
  ks: ['ks', 1],
}

/**
 * Převede množství z jednotky receptu na jednotku skladu (g ↔ kg, ml ↔ l, ks ↔ ks).
 * Recept bez jednotky („3 vejce“) = kusy. Jinak null – nejde porovnat (lžíce vs. balení).
 */
export function convertQty(qty: number, from: string | null, to: string): number | null {
  const a = BASE[from ?? 'ks']
  const b = BASE[to]
  if (!a || !b || a[0] !== b[0]) return null
  return (qty * a[1]) / b[1]
}
