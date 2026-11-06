import { useMemo } from 'react'
import { daysLeft, expiryLevel } from '../stock/expiry'
import { useStock, type StockItem } from '../stock/StockProvider'
import { useKitchen, type RecipeIngredient } from './KitchenProvider'

/** have = ve skladu, soon = ve skladu a prochází, staple = „mám vždy doma“, unknown = nespárovaná surovina */
export type IngredientStatus = 'have' | 'soon' | 'missing' | 'staple' | 'unknown'

export type RecipeAvailability = {
  status: (ri: RecipeIngredient) => IngredientStatus
  /** Kusy ve skladu pro surovinu, nejdřív procházející. */
  stockFor: (ingredientId: string) => StockItem[]
  summary: (recipeId: string) => { missing: RecipeIngredient[]; soon: RecipeIngredient[]; canCook: boolean }
}

export const STATUS_LABEL: Record<IngredientStatus, string> = {
  have: 'mám',
  soon: 'prochází',
  missing: 'chybí',
  staple: 'vždy doma',
  unknown: '?',
}

export const STATUS_BADGE: Record<IngredientStatus, string> = {
  have: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  soon: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  missing: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  staple: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  unknown: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
}

/**
 * Stav surovin receptu proti skladu. Množství se neporovnává (recept „200 g mouky“
 * vs. sklad „1 balení“) – stačí, že surovina doma je. Nespárovaná surovina počítá jako chybějící.
 */
export function useAvailability(): RecipeAvailability {
  const { items, productById, warnDays } = useStock()
  const { ingredientById, ingredientsOf } = useKitchen()

  return useMemo(() => {
    const byIngredient = new Map<string, StockItem[]>()
    for (const it of items) {
      const ing = productById.get(it.product_id)?.ingredient_id
      if (!ing) continue
      byIngredient.set(ing, [...(byIngredient.get(ing) ?? []), it])
    }
    for (const list of byIngredient.values()) {
      list.sort((a, b) => (a.expires_on ?? '9999').localeCompare(b.expires_on ?? '9999'))
    }

    const status = (ri: RecipeIngredient): IngredientStatus => {
      if (!ri.ingredient_id) return 'unknown'
      if (ingredientById.get(ri.ingredient_id)?.is_staple) return 'staple'
      const stock = byIngredient.get(ri.ingredient_id)
      if (!stock?.length) return 'missing'
      const soon = stock.some((s) => {
        const l = expiryLevel(daysLeft(s.expires_on), warnDays)
        return l === 'soon' || l === 'expired'
      })
      return soon ? 'soon' : 'have'
    }

    return {
      status,
      stockFor: (id) => byIngredient.get(id) ?? [],
      summary: (recipeId) => {
        const req = ingredientsOf(recipeId).filter((ri) => !ri.optional)
        const missing = req.filter((ri) => {
          const s = status(ri)
          return s === 'missing' || s === 'unknown'
        })
        const soon = ingredientsOf(recipeId).filter((ri) => status(ri) === 'soon')
        return { missing, soon, canCook: req.length > 0 && missing.length === 0 }
      },
    }
  }, [items, productById, warnDays, ingredientById, ingredientsOf])
}
