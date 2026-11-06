import { useMemo } from 'react'
import { daysLeft, expiryText } from '../stock/expiry'
import { useAvailability } from './availability'
import { useKitchen, type Recipe, type RecipeIngredient } from './KitchenProvider'

export type Suggestion = {
  recipe: Recipe
  score: number
  /** Procházející suroviny, které recept spotřebuje, s textem expirace („jogurt (zítra)“). */
  uses: { name: string; when: string }[]
  missing: RecipeIngredient[]
  /** Vařeno v posledních 7 dnech – před kolika dny. */
  cookedDaysAgo: number | null
}

const pragueFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' })
const pragueDate = (iso: string) => pragueFmt.format(new Date(iso))

/**
 * „Co uvařit?“ bez AI (SPEC kap. 4, bod 5):
 * skóre = podíl dostupných povinných surovin × 0,6
 *       + bonus za procházející suroviny (Σ 1/(dny do expirace + 1), max 1) × 0,4
 *       − 0,3, když se recept vařil v posledních 7 dnech.
 * categoryIds: prázdné = všechny kapitoly.
 */
export function useSuggestions(categoryIds: string[], limit = 5): Suggestion[] {
  const { recipes, ingredientsOf, categoriesOf, lastCooked } = useKitchen()
  const availability = useAvailability()

  return useMemo(() => {
    const out: Suggestion[] = []
    for (const recipe of recipes) {
      if (categoryIds.length && !categoriesOf(recipe.id).some((c) => categoryIds.includes(c.id))) continue
      const rows = ingredientsOf(recipe.id)
      const required = rows.filter((r) => !r.optional)
      if (required.length === 0) continue

      const missing = required.filter((r) => {
        const s = availability.status(r)
        return s === 'missing' || s === 'unknown'
      })
      const ratio = (required.length - missing.length) / required.length

      let bonus = 0
      const uses: Suggestion['uses'] = []
      const seen = new Set<string>()
      for (const r of rows) {
        if (!r.ingredient_id || seen.has(r.ingredient_id) || availability.status(r) !== 'soon') continue
        seen.add(r.ingredient_id)
        const days = Math.min(...availability.stockFor(r.ingredient_id).map((s) => daysLeft(s.expires_on) ?? 999))
        bonus += 1 / (Math.max(days, 0) + 1)
        uses.push({ name: r.name, when: days < 0 ? 'prošlé' : expiryText(days) })
      }

      const last = lastCooked(recipe.id)
      // Den vaření v Praze → kolik dní zpátky.
      const ago = last ? -(daysLeft(pragueDate(last)) ?? 0) : null
      const cookedDaysAgo = ago !== null && ago < 7 ? ago : null

      const score = ratio * 0.6 + Math.min(1, bonus) * 0.4 - (cookedDaysAgo !== null ? 0.3 : 0)
      out.push({ recipe, score, uses, missing, cookedDaysAgo })
    }
    return out
      .sort((a, b) => b.score - a.score || (b.recipe.rating ?? 0) - (a.recipe.rating ?? 0) || a.recipe.title.localeCompare(b.recipe.title, 'cs'))
      .slice(0, limit)
  }, [recipes, categoryIds, categoriesOf, ingredientsOf, availability, lastCooked, limit])
}

/** „spotřebuje jogurt (zítra) · chybí cibule, smetana“ */
export function explain(s: Suggestion): string {
  const parts: string[] = []
  if (s.uses.length) parts.push(`spotřebuje ${s.uses.map((u) => `${u.name} (${u.when})`).join(', ')}`)
  parts.push(s.missing.length ? `chybí ${s.missing.map((m) => m.name).join(', ')}` : 'máš všechno')
  if (s.cookedDaysAgo !== null) parts.push(s.cookedDaysAgo === 0 ? 'vařeno dnes' : `vařeno před ${s.cookedDaysAgo} d.`)
  return parts.join(' · ')
}
