import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useHousehold } from '../household/HouseholdProvider'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'
import { errorMessage, supabase } from '../lib/supabase'
import { addDays, todayIso } from '../stock/expiry'

export type Habit = Tables<'habits'>
export type HabitLog = Tables<'habit_logs'>
export type DayEntry = Tables<'day_entries'>

type HabitsState = {
  habits: Habit[]
  /** Zápisy za poslední ~2 roky, nejnovější první. */
  logs: HabitLog[]
  /** Denní záznamy (nálada + radost), nejnovější první. */
  days: DayEntry[]
  loading: boolean
  error: string | null
  logsOf: (habitId: string) => HabitLog[]
  dayOf: (date: string) => DayEntry | undefined
  saveHabit: (id: string | null, patch: Omit<TablesInsert<'habits'>, 'household_id'>) => Promise<Habit>
  updateHabit: (id: string, patch: TablesUpdate<'habits'>) => Promise<void>
  removeHabit: (id: string) => Promise<void>
  /** Zápis (datum = dnes, pokud není zadané). */
  addLog: (habitId: string, extra?: { activity_type?: string | null; note?: string | null; date?: string }) => Promise<void>
  removeLog: (id: string) => Promise<void>
  /** Uloží náladu / radost pro den (založí záznam, když ještě není). */
  saveDay: (date: string, patch: { mood?: number | null; joy?: string | null }) => Promise<void>
}

const HabitsContext = createContext<HabitsState | null>(null)

export class HabitError extends Error {}

type Table = 'habits' | 'habit_logs' | 'day_entries'

function upsert<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((r) => r.id === row.id)
  if (i === -1) return [...list, row]
  const copy = list.slice()
  copy[i] = row
  return copy
}

/** Soukromé návyky a denní záznamy přihlášeného uživatele (RLS: jen vlastník) + realtime mezi jeho zařízeními. */
export function HabitsProvider({ children }: { children: ReactNode }) {
  const { household, me } = useHousehold()
  const hh = household?.id ?? null
  const myId = me?.user_id ?? null
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [days, setDays] = useState<DayEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!hh || !myId) return
    const since = addDays(todayIso(), -800)
    const [h, l, d] = await Promise.all([
      supabase.from('habits').select('*').eq('owner_id', myId),
      supabase.from('habit_logs').select('*').eq('owner_id', myId).gte('date', since).limit(10000),
      supabase.from('day_entries').select('*').eq('owner_id', myId),
    ])
    const err = h.error ?? l.error ?? d.error
    if (err) setError(errorMessage(err))
    else {
      setHabits(h.data ?? [])
      setLogs(l.data ?? [])
      setDays(d.data ?? [])
      setError(null)
    }
    setLoading(false)
  }, [hh, myId])

  const local = useCallback((table: Table, row: Tables<Table>, del = false) => {
    const apply = <T extends { id: string }>(list: T[]) => (del ? list.filter((r) => r.id !== row.id) : upsert(list, row as unknown as T))
    if (table === 'habits') setHabits(apply)
    else if (table === 'habit_logs') setLogs(apply)
    else setDays(apply)
  }, [])

  useEffect(() => {
    if (!hh || !myId) return
    void reload()
    const filter = `owner_id=eq.${myId}`
    let channel = supabase.channel(`habits:${myId}`)
    for (const table of ['habits', 'habit_logs', 'day_entries'] as Table[]) {
      const on = (p: RealtimePostgresChangesPayload<Tables<Table>>) => {
        if (p.eventType === 'DELETE') {
          if ((p.old as { id?: string }).id) local(table, p.old as Tables<Table>, true)
        } else local(table, p.new as Tables<Table>)
      }
      channel = channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, on)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, on)
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, on)
    }
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
  }, [hh, myId, reload, local])

  const value = useMemo<HabitsState>(() => {
    const sortedLogs = logs.slice().sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
    const byHabit = new Map<string, HabitLog[]>()
    for (const l of sortedLogs) byHabit.set(l.habit_id, [...(byHabit.get(l.habit_id) ?? []), l])
    const sortedDays = days.slice().sort((a, b) => b.date.localeCompare(a.date))
    const byDate = new Map(sortedDays.map((d) => [d.date, d]))

    return {
      habits: habits.slice().sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at)),
      logs: sortedLogs,
      days: sortedDays,
      loading,
      error,
      logsOf: (id) => byHabit.get(id) ?? [],
      dayOf: (date) => byDate.get(date),
      async saveHabit(id, patch) {
        if (!hh) throw new HabitError('Chybí domácnost.')
        const q = id
          ? supabase.from('habits').update(patch).eq('id', id)
          : supabase.from('habits').insert({ ...patch, household_id: hh, sort: habits.length })
        const { data, error } = await q.select().single()
        if (error) throw new HabitError(errorMessage(error))
        local('habits', data)
        return data
      },
      async updateHabit(id, patch) {
        const { data, error } = await supabase.from('habits').update(patch).eq('id', id).select().single()
        if (error) throw new HabitError(errorMessage(error))
        local('habits', data)
      },
      async removeHabit(id) {
        const { error } = await supabase.from('habits').delete().eq('id', id)
        if (error) throw new HabitError(errorMessage(error))
        setHabits((l) => l.filter((h) => h.id !== id))
        setLogs((l) => l.filter((x) => x.habit_id !== id))
      },
      async addLog(habitId, extra = {}) {
        const { data, error } = await supabase
          .from('habit_logs')
          .insert({
            habit_id: habitId,
            activity_type: extra.activity_type?.trim() || null,
            note: extra.note?.trim() || null,
            ...(extra.date ? { date: extra.date } : {}),
          })
          .select()
          .single()
        if (error) throw new HabitError(errorMessage(error))
        local('habit_logs', data)
      },
      async removeLog(id) {
        const { error } = await supabase.from('habit_logs').delete().eq('id', id)
        if (error) throw new HabitError(errorMessage(error))
        setLogs((l) => l.filter((x) => x.id !== id))
      },
      async saveDay(date, patch) {
        if (!hh) throw new HabitError('Chybí domácnost.')
        const existing = byDate.get(date)
        const q = existing
          ? supabase.from('day_entries').update(patch).eq('id', existing.id)
          : supabase.from('day_entries').insert({ household_id: hh, date, ...patch })
        const { data, error } = await q.select().single()
        if (error) throw new HabitError(errorMessage(error))
        local('day_entries', data)
      },
    }
  }, [habits, logs, days, loading, error, hh, local])

  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>
}

export function useHabits() {
  const ctx = useContext(HabitsContext)
  if (!ctx) throw new Error('useHabits mimo HabitsProvider')
  return ctx
}
