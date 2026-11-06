import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useHousehold } from '../household/HouseholdProvider'
import type { Json, Tables, TablesUpdate } from '../lib/database.types'
import { errorMessage, supabase } from '../lib/supabase'

export type ShoppingItem = Tables<'shopping_items'>

/** Položka k přidání; stejná surovina / produkt / text se na seznamu sloučí (RPC add_shopping_items). */
export type NewShoppingItem = {
  text: string
  ingredient_id?: string | null
  product_id?: string | null
  quantity?: number | null
  unit?: string | null
  source?: 'manual' | 'recipe' | 'stock'
  recipe_title?: string | null
}

type ShoppingState = {
  items: ShoppingItem[]
  /** Neodškrtnuté, nejstarší nahoře. */
  open: ShoppingItem[]
  /** Odškrtnuté (v košíku), naposledy odškrtnuté nahoře. */
  done: ShoppingItem[]
  loading: boolean
  error: string | null
  /** Vrací počet nově založených položek (zbytek se sloučil s existujícími). */
  add: (items: NewShoppingItem[]) => Promise<number>
  toggle: (item: ShoppingItem) => Promise<void>
  update: (id: string, patch: TablesUpdate<'shopping_items'>) => Promise<void>
  remove: (id: string) => Promise<void>
  clearDone: () => Promise<void>
  /** Je surovina / produkt už na seznamu (neodškrtnutá)? */
  onList: (ref: { ingredientId?: string | null; productId?: string | null }) => boolean
}

const ShoppingContext = createContext<ShoppingState | null>(null)

export class ShoppingError extends Error {}

/** Sdílený nákupní seznam domácnosti + realtime (stejný princip jako StockProvider). */
export function ShoppingProvider({ children }: { children: ReactNode }) {
  const { household, me } = useHousehold()
  const hh = household?.id ?? null
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!hh) return
    const { data, error } = await supabase.from('shopping_items').select('*').eq('household_id', hh)
    if (error) setError(errorMessage(error))
    else {
      setItems(data)
      setError(null)
    }
    setLoading(false)
  }, [hh])

  const upsertLocal = useCallback((row: ShoppingItem) => {
    setItems((list) => {
      const i = list.findIndex((r) => r.id === row.id)
      if (i === -1) return [...list, row]
      const copy = list.slice()
      copy[i] = row
      return copy
    })
  }, [])

  useEffect(() => {
    if (!hh) return
    void reload()
    const onChange = (p: RealtimePostgresChangesPayload<ShoppingItem>) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as Partial<ShoppingItem>).id
        if (id) setItems((list) => list.filter((r) => r.id !== id))
      } else upsertLocal(p.new as ShoppingItem)
    }
    const filter = `household_id=eq.${hh}`
    const channel = supabase
      .channel(`shopping:${hh}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shopping_items', filter }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shopping_items', filter }, onChange)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'shopping_items' }, onChange)
    let first = true
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (!first) void reload()
        first = false
      }
    })
    const onVisible = () => document.visibilityState === 'visible' && void reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [hh, reload, upsertLocal])

  const value = useMemo<ShoppingState>(() => {
    const open = items.filter((i) => !i.checked).sort((a, b) => a.created_at.localeCompare(b.created_at))
    const done = items.filter((i) => i.checked).sort((a, b) => (b.checked_at ?? '').localeCompare(a.checked_at ?? ''))
    const ingredientIds = new Set(open.map((i) => i.ingredient_id).filter(Boolean))
    const productIds = new Set(open.map((i) => i.product_id).filter(Boolean))

    return {
      items,
      open,
      done,
      loading,
      error,
      async add(newItems) {
        if (!hh || newItems.length === 0) return 0
        const { data, error } = await supabase.rpc('add_shopping_items', {
          p_household_id: hh,
          p_items: newItems as unknown as Json,
        })
        if (error) throw new ShoppingError(errorMessage(error))
        await reload()
        return data ?? 0
      },
      async toggle(item) {
        const checked = !item.checked
        // Okamžitě v UI (v obchodě se odškrtává rychle), DB potvrdí.
        upsertLocal({ ...item, checked, checked_at: checked ? new Date().toISOString() : null, checked_by: checked ? (me?.user_id ?? null) : null })
        const { data, error } = await supabase
          .from('shopping_items')
          .update({ checked, checked_at: checked ? new Date().toISOString() : null, checked_by: checked ? (me?.user_id ?? null) : null })
          .eq('id', item.id)
          .select()
          .single()
        if (error) {
          upsertLocal(item)
          throw new ShoppingError(errorMessage(error))
        }
        upsertLocal(data)
      },
      async update(id, patch) {
        const { data, error } = await supabase.from('shopping_items').update(patch).eq('id', id).select().single()
        if (error) throw new ShoppingError(errorMessage(error))
        upsertLocal(data)
      },
      async remove(id) {
        const { error } = await supabase.from('shopping_items').delete().eq('id', id)
        if (error) throw new ShoppingError(errorMessage(error))
        setItems((list) => list.filter((r) => r.id !== id))
      },
      async clearDone() {
        if (!hh) return
        const ids = done.map((i) => i.id)
        if (ids.length === 0) return
        const { error } = await supabase.from('shopping_items').delete().in('id', ids)
        if (error) throw new ShoppingError(errorMessage(error))
        setItems((list) => list.filter((r) => !ids.includes(r.id)))
      },
      onList: ({ ingredientId, productId }) =>
        (!!ingredientId && ingredientIds.has(ingredientId)) || (!!productId && productIds.has(productId)),
    }
  }, [items, loading, error, hh, me, reload, upsertLocal])

  return <ShoppingContext.Provider value={value}>{children}</ShoppingContext.Provider>
}

export function useShopping() {
  const ctx = useContext(ShoppingContext)
  if (!ctx) throw new Error('useShopping mimo ShoppingProvider')
  return ctx
}
