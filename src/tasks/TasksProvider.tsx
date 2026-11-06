import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useHousehold } from '../household/HouseholdProvider'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'
import { errorMessage, supabase } from '../lib/supabase'
import { todayIso } from '../stock/expiry'

export type Task = Tables<'tasks'>

type TasksState = {
  /** Nehotové úkoly + hotové za posledních 14 dní (RLS: sdílené + vlastní soukromé). */
  tasks: Task[]
  loading: boolean
  error: string | null
  add: (task: Omit<TablesInsert<'tasks'>, 'household_id'>) => Promise<Task>
  update: (id: string, patch: TablesUpdate<'tasks'>) => Promise<void>
  setDone: (task: Task, done: boolean) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Načte starší hotové úkoly (historie); vrací, zda nějaké přibyly. */
  loadOlderDone: () => Promise<boolean>
  /** Je úkol „můj“: přiřazený mně, nebo nepřiřazený a můj / sdílený. */
  isMine: (t: Task) => boolean
  /** Top 3 na dnešek: ručně vybrané (top3_on = dnes), doplněné o úkoly po termínu a na dnes. */
  top3: Task[]
}

const TasksContext = createContext<TasksState | null>(null)

export class TaskError extends Error {}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

/** Úkoly domácnosti + realtime (stejný princip jako StockProvider). */
export function TasksProvider({ children }: { children: ReactNode }) {
  const { household, me } = useHousehold()
  const hh = household?.id ?? null
  const myId = me?.user_id ?? null
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!hh) return
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('household_id', hh)
      .or(`done_at.is.null,done_at.gte.${sinceIso(14)}`)
    if (error) setError(errorMessage(error))
    else {
      setTasks(data)
      setError(null)
    }
    setLoading(false)
  }, [hh])

  const upsertLocal = useCallback((row: Task) => {
    setTasks((list) => {
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
    const onChange = (p: RealtimePostgresChangesPayload<Task>) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as Partial<Task>).id
        if (id) setTasks((list) => list.filter((r) => r.id !== id))
      } else upsertLocal(p.new as Task)
    }
    const filter = `household_id=eq.${hh}`
    const channel = supabase
      .channel(`tasks:${hh}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', filter }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks', filter }, onChange)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, onChange)
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

  const value = useMemo<TasksState>(() => {
    const isMine = (t: Task) =>
      t.assignee_id ? t.assignee_id === myId : t.visibility === 'private' ? t.owner_id === myId : true

    const today = todayIso()
    const open = tasks.filter((t) => !t.done_at && isMine(t))
    const byUrgency = (a: Task, b: Task) =>
      b.priority - a.priority || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.created_at.localeCompare(b.created_at)
    const pinned = open.filter((t) => t.top3_on === today).sort(byUrgency)
    const due = open.filter((t) => t.top3_on !== today && t.due_date && t.due_date <= today).sort(byUrgency)
    const top3 = [...pinned, ...due].slice(0, 3)

    return {
      tasks,
      loading,
      error,
      isMine,
      top3,
      async add(task) {
        if (!hh) throw new TaskError('Chybí domácnost.')
        const { data, error } = await supabase.from('tasks').insert({ ...task, household_id: hh }).select().single()
        if (error) throw new TaskError(errorMessage(error))
        upsertLocal(data)
        return data
      },
      async update(id, patch) {
        const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select().single()
        if (error) throw new TaskError(errorMessage(error))
        upsertLocal(data)
      },
      async setDone(task, done) {
        // Hned v UI, DB potvrdí (a u opakovaného úkolu založí další výskyt).
        upsertLocal({ ...task, done_at: done ? new Date().toISOString() : null })
        const { error } = await supabase.rpc('set_task_done', { p_task_id: task.id, p_done: done })
        if (error) {
          upsertLocal(task)
          throw new TaskError(errorMessage(error))
        }
        await reload()
      },
      async loadOlderDone() {
        if (!hh) return false
        const oldest = tasks.filter((t) => t.done_at).reduce((m, t) => (t.done_at! < m ? t.done_at! : m), sinceIso(14))
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('household_id', hh)
          .lt('done_at', oldest)
          .order('done_at', { ascending: false })
          .limit(200)
        if (error) throw new TaskError(errorMessage(error))
        setTasks((list) => [...list, ...data.filter((d) => !list.some((t) => t.id === d.id))])
        return data.length > 0
      },
      async remove(id) {
        const { error } = await supabase.from('tasks').delete().eq('id', id)
        if (error) throw new TaskError(errorMessage(error))
        setTasks((list) => list.filter((r) => r.id !== id))
      },
    }
  }, [tasks, loading, error, hh, myId, reload, upsertLocal])

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
}

export function useTasks() {
  const ctx = useContext(TasksContext)
  if (!ctx) throw new Error('useTasks mimo TasksProvider')
  return ctx
}
