import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Button, ErrorText } from '../components/ui'
import { STATUS_BADGE, STATUS_LABEL, useAvailability } from '../kitchen/availability'
import { useKitchen, type RecipeIngredient } from '../kitchen/KitchenProvider'
import { roundQty } from '../kitchen/units'
import { useShopping } from './ShoppingProvider'

const qtyFmt = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 })

/**
 * „Chybějící do nákupu“: suroviny receptu, co chybí, jsou předem zaškrtnuté;
 * ostatní jde přidat taky (třeba když doma je, ale málo).
 */
export function AddFromRecipeSheet({
  recipeId,
  factor,
  open,
  onClose,
}: {
  recipeId: string
  factor: number
  open: boolean
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Do nákupu">
      {open && <Body recipeId={recipeId} factor={factor} onClose={onClose} />}
    </Sheet>
  )
}

function Body({ recipeId, factor, onClose }: { recipeId: string; factor: number; onClose: () => void }) {
  const { recipeById, ingredientsOf, ingredientById } = useKitchen()
  const availability = useAvailability()
  const shopping = useShopping()
  const toast = useToast()
  const recipe = recipeById.get(recipeId)
  const rows = ingredientsOf(recipeId)
  const isMissing = (ri: RecipeIngredient) => {
    const s = availability.status(ri)
    return !ri.optional && (s === 'missing' || s === 'unknown')
  }
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((ri) => isMissing(ri) && !shopping.onList({ ingredientId: ri.ingredient_id })).map((ri) => ri.id)),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Chybějící nahoře, pak ostatní.
  const sorted = [...rows.filter(isMissing), ...rows.filter((ri) => !isMissing(ri))]

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const chosen = rows.filter((ri) => selected.has(ri.id))
      await shopping.add(
        chosen.map((ri) => ({
          text: (ri.ingredient_id && ingredientById.get(ri.ingredient_id)?.name) || ri.name,
          ingredient_id: ri.ingredient_id,
          quantity: ri.quantity != null ? roundQty(ri.quantity * factor) : null,
          unit: ri.unit,
          source: 'recipe',
          recipe_title: recipe?.title ?? null,
        })),
      )
      toast(`Na nákupní seznam: ${chosen.length} ${chosen.length === 1 ? 'položka' : chosen.length < 5 ? 'položky' : 'položek'}`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se přidat.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {sorted.map((ri) => {
          const st = availability.status(ri)
          const listed = shopping.onList({ ingredientId: ri.ingredient_id })
          return (
            <li key={ri.id}>
              <label className="flex min-h-12 items-center gap-3 py-1">
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-brand-700"
                  checked={selected.has(ri.id)}
                  onChange={(e) =>
                    setSelected((s) => {
                      const n = new Set(s)
                      if (e.target.checked) n.add(ri.id)
                      else n.delete(ri.id)
                      return n
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block">{ri.name}</span>
                  <span className="block text-sm text-neutral-500">
                    {ri.quantity != null ? `${qtyFmt.format(roundQty(ri.quantity * factor))} ${ri.unit ?? ''}` : ''}
                    {listed && <span className="text-brand-700 dark:text-brand-500"> · už je na seznamu</span>}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[st]}`}>{STATUS_LABEL[st]}</span>
              </label>
            </li>
          )
        })}
      </ul>
      <p className="text-sm text-neutral-500">Co už na seznamu je, se nezdvojí – množství se sečte.</p>
      <ErrorText>{error}</ErrorText>
      <Button className="w-full" disabled={busy || selected.size === 0} onClick={() => void submit()}>
        Přidat na seznam ({selected.size})
      </Button>
    </div>
  )
}
