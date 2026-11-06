import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useHousehold } from '../household/HouseholdProvider'
import type { Tables } from '../lib/database.types'
import { errorMessage, supabase } from '../lib/supabase'
import { useStock } from '../stock/StockProvider'
import { todayIso } from '../stock/expiry'

export type Pin = Tables<'display_pins'>
export type PinKind = Pin['kind']
export type PinUntil = { kind: 'end_of_day' | 'until_removed' | 'date'; date?: string }

type DisplayState = {
  /** Živý obraz zapnutý v Nastavení. */
  enabled: boolean
  /** Platné piny celé domácnosti. */
  pins: Pin[]
  myPins: Pin[]
  /** Připne text na displej; když jsou 3 sloty plné, nahradí `replaceSlot`. */
  pin: (input: { kind: PinKind; refId?: string | null; text: string; until: PinUntil; replaceSlot?: number }) => Promise<void>
  unpin: (id: string) => Promise<void>
  pushNow: () => Promise<boolean>
}

const DisplayContext = createContext<DisplayState | null>(null)

export class DisplayError extends Error {}

function valid(p: Pin, today: string) {
  if (p.until_kind === 'end_of_day') return p.created_on >= today
  if (p.until_kind === 'date') return (p.until_date ?? '') >= today
  return true
}

/** Připnuté položky na displej Živý obraz + realtime. Odeslání řeší DB (pg_cron / push_display_now). */
export function DisplayProvider({ children }: { children: ReactNode }) {
  const { household, me } = useHousehold()
  const { settings } = useStock()
  const hh = household?.id ?? null
  const [pins, setPins] = useState<Pin[]>([])

  const reload = useCallback(async () => {
    if (!hh) return
    const { data } = await supabase.from('display_pins').select('*').eq('household_id', hh)
    if (data) setPins(data)
  }, [hh])

  useEffect(() => {
    if (!hh) return
    void reload()
    const on = (p: RealtimePostgresChangesPayload<Pin>) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as Partial<Pin>).id
        if (id) setPins((l) => l.filter((x) => x.id !== id))
      } else {
        const row = p.new as Pin
        setPins((l) => [...l.filter((x) => x.id !== row.id), row])
      }
    }
    const filter = `household_id=eq.${hh}`
    const channel = supabase
      .channel(`pins:${hh}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'display_pins', filter }, on)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'display_pins', filter }, on)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'display_pins' }, on)
      .subscribe()
    const onVisible = () => document.visibilityState === 'visible' && void reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [hh, reload])

  const value = useMemo<DisplayState>(() => {
    const today = todayIso()
    const live = pins.filter((p) => valid(p, today)).sort((a, b) => a.slot - b.slot)
    const myPins = live.filter((p) => p.owner_id === me?.user_id)

    const pushNow = async () => {
      if (!hh) return false
      const { data, error } = await supabase.rpc('push_display_now', { p_household_id: hh })
      if (error) throw new DisplayError(errorMessage(error))
      return !!data
    }

    return {
      enabled: !!settings?.zivyobraz_enabled,
      pins: live,
      myPins,
      pushNow,
      async pin({ kind, refId, text, until, replaceSlot }) {
        if (!hh || !me) throw new DisplayError('Chybí domácnost.')
        // Prošlé vlastní piny drží slot – uvolnit je.
        const stale = pins.filter((p) => p.owner_id === me.user_id && !valid(p, today))
        if (stale.length) await supabase.from('display_pins').delete().in('id', stale.map((p) => p.id))
        const used = new Set(myPins.map((p) => p.slot))
        const slot = replaceSlot ?? [1, 2, 3].find((s) => !used.has(s))
        if (!slot) throw new DisplayError('Na displeji máš už 3 položky – vyber, kterou nahradit.')
        if (replaceSlot) await supabase.from('display_pins').delete().eq('owner_id', me.user_id).eq('slot', replaceSlot)
        const { data, error } = await supabase
          .from('display_pins')
          .insert({
            household_id: hh,
            kind,
            ref_id: refId ?? null,
            text: text.trim().slice(0, 60),
            slot,
            until_kind: until.kind,
            until_date: until.kind === 'date' ? until.date : null,
          })
          .select()
          .single()
        if (error) throw new DisplayError(errorMessage(error))
        setPins((l) => [...l.filter((x) => !(x.owner_id === me.user_id && x.slot === slot)), data])
        await pushNow().catch(() => false)
      },
      async unpin(id) {
        const { error } = await supabase.from('display_pins').delete().eq('id', id)
        if (error) throw new DisplayError(errorMessage(error))
        setPins((l) => l.filter((x) => x.id !== id))
        await pushNow().catch(() => false)
      },
    }
  }, [pins, hh, me, settings?.zivyobraz_enabled])

  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>
}

export function useDisplay() {
  const ctx = useContext(DisplayContext)
  if (!ctx) throw new Error('useDisplay mimo DisplayProvider')
  return ctx
}
