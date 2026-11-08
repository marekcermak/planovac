import { useMemo } from 'react'
import { errorMessage, supabase } from '../lib/supabase'
import { useStock } from './StockProvider'

/** Chyba s českou hláškou pro UI. */
export class ActionError extends Error {}

function check(error: unknown) {
  if (error) throw new ActionError(errorMessage(error))
}

/**
 * Akce nad zásobami (RPC funkce v DB zapisují i události).
 * Po úspěchu se položka hned načte do lokálního stavu, realtime pak jen potvrdí.
 */
export function useStockActions() {
  const { refreshItem } = useStock()

  return useMemo(
    () => ({
      async add(args: {
        productId: string
        locationId?: string | null
        quantity?: number | null
        unit?: string | null
        expiresOn?: string | null
      }): Promise<string> {
        const { data, error } = await supabase.rpc('add_stock', {
          p_product_id: args.productId,
          p_location_id: args.locationId ?? undefined,
          p_quantity: args.quantity ?? undefined,
          p_unit: args.unit ?? undefined,
          p_expires_on: args.expiresOn || undefined,
        })
        check(error)
        await refreshItem(data as string)
        return data as string
      },
      async take(itemId: string, kind: 'consume' | 'waste', quantity?: number) {
        const { error } = await supabase.rpc('take_stock', { p_item_id: itemId, p_kind: kind, p_quantity: quantity })
        check(error)
        await refreshItem(itemId)
      },
      async open(itemId: string) {
        const { error } = await supabase.rpc('open_stock', { p_item_id: itemId })
        check(error)
        await refreshItem(itemId)
      },
      async move(itemId: string, locationId: string | null) {
        const { error } = await supabase.rpc('move_stock', {
          p_item_id: itemId,
          p_location_id: locationId as string,
        })
        check(error)
        await refreshItem(itemId)
      },
      /** Stav naplnění: 2 = plná, 1 = půlka, 0 = prázdná. */
      async setFill(itemId: string, level: number) {
        const { error } = await supabase.rpc('set_stock_fill', { p_item_id: itemId, p_level: level })
        check(error)
        await refreshItem(itemId)
      },
      async adjust(itemId: string, quantity?: number, expiresOn?: string) {
        const { error } = await supabase.rpc('adjust_stock', {
          p_item_id: itemId,
          p_quantity: quantity,
          p_expires_on: expiresOn,
        })
        check(error)
        await refreshItem(itemId)
      },
    }),
    [refreshItem],
  )
}
