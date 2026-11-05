import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useHousehold } from '../household/HouseholdProvider'
import type { Tables } from '../lib/database.types'
import { errorMessage, supabase } from '../lib/supabase'

export type Zone = Tables<'zones'>
export type Location = Tables<'locations'>
export type Category = Tables<'categories'>
export type Product = Tables<'products'>
export type StockItem = Tables<'stock_items'>
export type Settings = Tables<'settings'>

type Data = {
  zones: Zone[]
  locations: Location[]
  categories: Category[]
  products: Product[]
  items: StockItem[] // jen aktivní
  settings: Settings | null
}

const EMPTY: Data = { zones: [], locations: [], categories: [], products: [], items: [], settings: null }

type Table = 'zones' | 'locations' | 'categories' | 'products' | 'stock_items'
const TABLE_KEY = {
  zones: 'zones',
  locations: 'locations',
  categories: 'categories',
  products: 'products',
  stock_items: 'items',
} as const satisfies Record<Table, keyof Data>

type StockState = Data & {
  loading: boolean
  error: string | null
  warnDays: number
  reload: () => Promise<void>
  zoneById: Map<string, Zone>
  locationById: Map<string, Location>
  categoryById: Map<string, Category>
  productById: Map<string, Product>
  /** „Lednice · Police 2“ */
  locationName: (locationId: string | null) => string
  /** Upsert jednoho řádku do lokálního stavu (po vlastní změně, než dorazí realtime). */
  upsertLocal: <T extends Table>(table: T, row: Tables<T>) => void
  removeLocal: (table: Table, id: string) => void
  refreshItem: (id: string) => Promise<void>
}

const StockContext = createContext<StockState | null>(null)

function upsert<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((r) => r.id === row.id)
  if (i === -1) return [...list, row]
  const copy = list.slice()
  copy[i] = row
  return copy
}

function byId<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((r) => [r.id, r]))
}

/**
 * Data skladu domácnosti + živá synchronizace (Supabase Realtime).
 * Po (znovu)připojení kanálu a při návratu aplikace do popředí se vše načte znovu,
 * protože iOS uspanou PWA odpojí a zprávy z té doby se ztratí.
 */
export function StockProvider({ children }: { children: ReactNode }) {
  const { household } = useHousehold()
  const hh = household?.id ?? null
  const [data, setData] = useState<Data>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadSeq = useRef(0)

  const reload = useCallback(async () => {
    if (!hh) return
    const seq = ++loadSeq.current
    try {
      const [zones, locations, categories, products, items, settings] = await Promise.all([
        supabase.from('zones').select('*').eq('household_id', hh),
        supabase.from('locations').select('*').eq('household_id', hh),
        supabase.from('categories').select('*').eq('household_id', hh),
        supabase.from('products').select('*').eq('household_id', hh),
        supabase.from('stock_items').select('*').eq('household_id', hh).eq('status', 'active'),
        supabase.from('settings').select('*').eq('household_id', hh).maybeSingle(),
      ])
      for (const r of [zones, locations, categories, products, items, settings]) if (r.error) throw r.error
      if (seq !== loadSeq.current) return
      setData({
        zones: zones.data ?? [],
        locations: locations.data ?? [],
        categories: categories.data ?? [],
        products: products.data ?? [],
        items: items.data ?? [],
        settings: settings.data ?? null,
      })
      setError(null)
    } catch (e) {
      if (seq === loadSeq.current) setError(errorMessage(e))
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [hh])

  const upsertLocal = useCallback(<T extends Table>(table: T, row: Tables<T>) => {
    const key = TABLE_KEY[table]
    setData((d) => {
      if (table === 'stock_items' && (row as StockItem).status !== 'active') {
        return { ...d, items: d.items.filter((r) => r.id !== row.id) }
      }
      return { ...d, [key]: upsert(d[key] as { id: string }[], row as { id: string }) }
    })
  }, [])

  const removeLocal = useCallback((table: Table, id: string) => {
    const key = TABLE_KEY[table]
    setData((d) => ({ ...d, [key]: (d[key] as { id: string }[]).filter((r) => r.id !== id) }))
  }, [])

  const refreshItem = useCallback(
    async (id: string) => {
      const { data: row } = await supabase.from('stock_items').select('*').eq('id', id).maybeSingle()
      if (row) upsertLocal('stock_items', row)
      else removeLocal('stock_items', id)
    },
    [upsertLocal, removeLocal],
  )

  useEffect(() => {
    if (!hh) return
    void reload()

    const onChange = (table: Table) => (p: RealtimePostgresChangesPayload<{ id: string }>) => {
      if (p.eventType === 'DELETE') {
        if (p.old.id) removeLocal(table, p.old.id)
      } else {
        upsertLocal(table, p.new as never)
      }
    }

    // DELETE události nejdou filtrovat podle household_id (nesou jen primární klíč).
    let channel = supabase.channel(`stock:${hh}`)
    for (const table of Object.keys(TABLE_KEY) as Table[]) {
      const filter = `household_id=eq.${hh}`
      channel = channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, onChange(table))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, onChange(table))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, onChange(table))
    }
    channel = channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'settings', filter: `household_id=eq.${hh}` },
      (p) => setData((d) => ({ ...d, settings: p.new as Settings })),
    )

    let subscribedOnce = false
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // První připojení: data už se načítají. Další = reconnect → dohnat zmeškané.
        if (subscribedOnce) void reload()
        subscribedOnce = true
      }
    })

    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [hh, reload, upsertLocal, removeLocal])

  const value = useMemo<StockState>(() => {
    const zoneById = byId(data.zones)
    const locationById = byId(data.locations)
    return {
      ...data,
      zones: data.zones.slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'cs')),
      categories: data.categories.slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'cs')),
      products: data.products.slice().sort((a, b) => a.name.localeCompare(b.name, 'cs')),
      loading,
      error,
      warnDays: data.settings?.expiry_warn_days ?? 2,
      reload,
      zoneById,
      locationById,
      categoryById: byId(data.categories),
      productById: byId(data.products),
      locationName: (id) => {
        const loc = id ? locationById.get(id) : undefined
        if (!loc) return 'Bez místa'
        const zone = zoneById.get(loc.zone_id)
        return zone ? `${zone.name} · ${loc.label}` : loc.label
      },
      upsertLocal,
      removeLocal,
      refreshItem,
    }
  }, [data, loading, error, reload, upsertLocal, removeLocal, refreshItem])

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>
}

export function useStock() {
  const ctx = useContext(StockContext)
  if (!ctx) throw new Error('useStock mimo StockProvider')
  return ctx
}
