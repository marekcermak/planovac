import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Button, Chip, ErrorText } from '../components/ui'
import { errorMessage, supabase } from '../lib/supabase'
import { daysLeft, expiryText, formatQty } from '../stock/expiry'
import { useStock, type StockItem } from '../stock/StockProvider'
import { useAvailability } from './availability'
import { useKitchen } from './KitchenProvider'
import { convertQty, roundQty } from './units'

type Mode = 'skip' | 'amount' | 'all'

type Row = {
  ingredientId: string
  name: string
  stock: StockItem[]
  /** Potřebné množství v jednotce prvního kusu skladu, když jde převést. */
  need: number | null
  unit: string
  staple: boolean
}

/**
 * „Uvařeno“: návrh, co odečíst ze skladu (nejdřív kusy, které nejdřív procházejí).
 * Množství se odečítá jen tam, kde jde převést jednotky; jinak „celý kus“ nebo „nechat“.
 */
export function CookSheet({
  recipeId,
  factor,
  servings,
  open,
  onClose,
}: {
  recipeId: string
  factor: number
  servings: number | null
  open: boolean
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Uvařeno">
      {open && <Body recipeId={recipeId} factor={factor} servings={servings} onClose={onClose} />}
    </Sheet>
  )
}

function Body({ recipeId, factor, servings, onClose }: { recipeId: string; factor: number; servings: number | null; onClose: () => void }) {
  const { recipeById, ingredientsOf, ingredientById, upsertLocal } = useKitchen()
  const { productById, reload: reloadStock } = useStock()
  const availability = useAvailability()
  const toast = useToast()
  const recipe = recipeById.get(recipeId)!

  // Suroviny receptu, které jsou ve skladu (stejná surovina víckrát → sečíst).
  const [rows] = useState<Row[]>(() => {
    const map = new Map<string, Row>()
    for (const ri of ingredientsOf(recipeId)) {
      if (!ri.ingredient_id) continue
      const stock = availability.stockFor(ri.ingredient_id)
      if (stock.length === 0) continue
      const unit = stock[0].unit
      const need = ri.quantity != null ? convertQty(ri.quantity * factor, ri.unit, unit) : null
      const prev = map.get(ri.ingredient_id)
      if (prev) {
        prev.need = prev.need != null && need != null ? prev.need + need : null
        continue
      }
      map.set(ri.ingredient_id, {
        ingredientId: ri.ingredient_id,
        name: ingredientById.get(ri.ingredient_id)?.name ?? ri.name,
        stock,
        need,
        unit,
        staple: ingredientById.get(ri.ingredient_id)?.is_staple ?? false,
      })
    }
    return [...map.values()]
  })
  const [modes, setModes] = useState<Record<string, Mode>>(() =>
    Object.fromEntries(rows.map((r) => [r.ingredientId, r.staple ? 'skip' : r.need != null ? 'amount' : 'skip'])),
  )
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.ingredientId, r.need != null ? String(roundQty(r.need)).replace('.', ',') : ''])),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Kusy ve skladu k odečtu: množství se rozloží od nejdřív procházejícího kusu. */
  function takesFor(r: Row): { item_id: string; quantity?: number }[] {
    const mode = modes[r.ingredientId]
    if (mode === 'all') return [{ item_id: r.stock[0].id }]
    if (mode !== 'amount') return []
    let left = Number(amounts[r.ingredientId]?.replace(',', '.'))
    if (!Number.isFinite(left) || left <= 0) return []
    const out: { item_id: string; quantity?: number }[] = []
    for (const s of r.stock) {
      if (left <= 0) break
      if (s.unit !== r.unit) continue
      if (left >= s.quantity) {
        out.push({ item_id: s.id })
        left -= s.quantity
      } else {
        out.push({ item_id: s.id, quantity: left })
        left = 0
      }
    }
    return out
  }

  async function submit() {
    setBusy(true)
    setError(null)
    const takes = rows.flatMap(takesFor)
    const { error } = await supabase.rpc('cook_recipe', {
      p_recipe_id: recipeId,
      p_servings: servings ?? undefined,
      p_takes: takes,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    await reloadStock()
    // cook_log dorazí i realtime; pro jistotu hned lokálně
    const { data } = await supabase.from('cook_log').select('*').eq('recipe_id', recipeId).order('cooked_at', { ascending: false }).limit(1).maybeSingle()
    if (data) upsertLocal('cook_log', data)
    toast(takes.length ? `Uvařeno: ${recipe.title} · ze skladu odečteno ${takes.length}×` : `Uvařeno: ${recipe.title}`)
    onClose()
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <p className="text-neutral-600 dark:text-neutral-400">Ze skladu se nic neodečte – žádná surovina receptu tam není. Uvaření se jen zapíše.</p>
      ) : (
        <>
          <p className="text-sm text-neutral-500">Co odečíst ze skladu? Bere se nejdřív to, co nejdřív prochází.</p>
          <ul className="space-y-3">
            {rows.map((r) => {
              const first = r.stock[0]
              const product = productById.get(first.product_id)
              const days = daysLeft(first.expires_on)
              const mode = modes[r.ingredientId]
              const set = (m: Mode) => setModes((s) => ({ ...s, [r.ingredientId]: m }))
              return (
                <li key={r.ingredientId} className="rounded-2xl p-3 ring-1 ring-neutral-200 dark:ring-neutral-800">
                  <div className="mb-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-sm text-neutral-500">
                      {product?.name} · {formatQty(first.quantity, first.unit)}
                      {first.expires_on && ` · ${expiryText(days) || first.expires_on}`}
                      {r.stock.length > 1 && ` (+${r.stock.length - 1} další)`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip active={mode === 'skip'} onClick={() => set('skip')}>
                      Nechat
                    </Chip>
                    <Chip active={mode === 'amount'} onClick={() => set('amount')}>
                      Odečíst
                    </Chip>
                    <Chip active={mode === 'all'} onClick={() => set('all')}>
                      Celý kus
                    </Chip>
                    {mode === 'amount' && (
                      <label className="flex items-center gap-1">
                        <input
                          inputMode="decimal"
                          aria-label={`Kolik ${r.name}`}
                          value={amounts[r.ingredientId] ?? ''}
                          onChange={(e) => setAmounts((a) => ({ ...a, [r.ingredientId]: e.target.value }))}
                          className="min-h-10 w-20 rounded-xl border border-neutral-300 bg-white px-2 text-right dark:border-neutral-700 dark:bg-neutral-900"
                        />
                        <span className="text-sm">{r.unit}</span>
                      </label>
                    )}
                  </div>
                  {r.need == null && mode === 'skip' && !r.staple && (
                    <p className="mt-1 text-xs text-neutral-500">Jednotky receptu a skladu nejdou porovnat – vyber sám.</p>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <Button className="w-full" disabled={busy} onClick={() => void submit()}>
        Uvařeno{servings ? ` (${servings} ${servings === 1 ? 'porce' : servings < 5 ? 'porce' : 'porcí'})` : ''}
      </Button>
    </div>
  )
}
