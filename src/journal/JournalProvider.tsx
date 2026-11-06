import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useHousehold } from '../household/HouseholdProvider'
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types'
import { JOURNAL_BUCKET, shrinkImage } from '../lib/images'
import { errorMessage, supabase } from '../lib/supabase'

export type Chapter = Tables<'journal_chapters'>
export type Entry = Tables<'journal_entries'>

export const SOURCE_LABEL: Record<string, string> = {
  vlastni: 'Vlastní',
  kniha: 'Kniha',
  clanek: 'Článek',
  podcast: 'Podcast',
  rozhovor: 'Rozhovor',
  jine: 'Jiné',
}

type EntryInput = Omit<TablesInsert<'journal_entries'>, 'household_id' | 'photo_paths'>

type JournalState = {
  /** Kapitoly, které vidím (moje + sdílené), seřazené. */
  chapters: Chapter[]
  /** Zápisy, které vidím, nejnovější první. */
  entries: Entry[]
  loading: boolean
  error: string | null
  chapterById: Map<string, Chapter>
  saveChapter: (id: string | null, patch: Omit<TablesInsert<'journal_chapters'>, 'household_id'>) => Promise<Chapter>
  removeChapter: (id: string) => Promise<void>
  /** Uloží zápis; nové fotky nahraje, odebrané smaže ze Storage. */
  saveEntry: (id: string | null, data: EntryInput, photos?: { keep: string[]; add: Blob[] }) => Promise<Entry>
  updateEntry: (id: string, patch: TablesUpdate<'journal_entries'>) => Promise<void>
  removeEntry: (entry: Entry) => Promise<void>
}

const JournalContext = createContext<JournalState | null>(null)

export class JournalError extends Error {}

function upsert<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((r) => r.id === row.id)
  if (i === -1) return [...list, row]
  const copy = list.slice()
  copy[i] = row
  return copy
}

/** Deník: kapitoly a zápisy, které uživatel smí vidět (RLS) + realtime. */
export function JournalProvider({ children }: { children: ReactNode }) {
  const { household, me } = useHousehold()
  const hh = household?.id ?? null
  const myId = me?.user_id ?? null
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seeded = useRef(false)

  const reload = useCallback(async () => {
    if (!hh || !myId) return
    const fetchAll = () =>
      Promise.all([
        supabase.from('journal_chapters').select('*').eq('household_id', hh),
        supabase.from('journal_entries').select('*').eq('household_id', hh).order('entry_date', { ascending: false }).limit(5000),
      ])
    let [c, e] = await fetchAll()
    // První otevření: výchozí kapitoly Myšlenky + Deník.
    if (!c.error && !seeded.current && !(c.data ?? []).some((x) => x.owner_id === myId)) {
      seeded.current = true
      await supabase.rpc('ensure_journal_defaults')
      ;[c, e] = await fetchAll()
    }
    seeded.current = true
    const err = c.error ?? e.error
    if (err) setError(errorMessage(err))
    else {
      setChapters(c.data ?? [])
      setEntries(e.data ?? [])
      setError(null)
    }
    setLoading(false)
  }, [hh, myId])

  useEffect(() => {
    if (!hh) return
    void reload()
    const filter = `household_id=eq.${hh}`
    const handler =
      <T extends { id: string }>(set: Dispatch<SetStateAction<T[]>>) =>
      (p: RealtimePostgresChangesPayload<T>) => {
        if (p.eventType === 'DELETE') {
          const id = (p.old as Partial<T>).id
          if (id) set((l) => l.filter((r) => r.id !== id))
        } else set((l) => upsert(l, p.new as T))
      }
    const onChapter = handler<Chapter>(setChapters)
    const onEntry = handler<Entry>(setEntries)
    const channel = supabase
      .channel(`journal:${hh}:${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'journal_chapters', filter }, onChapter)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'journal_chapters', filter }, onChapter)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'journal_chapters' }, onChapter)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'journal_entries', filter }, onEntry)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'journal_entries', filter }, onEntry)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'journal_entries' }, onEntry)
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
  }, [hh, myId, reload])

  const value = useMemo<JournalState>(() => {
    const sortedChapters = chapters
      .slice()
      .sort((a, b) => Number(a.owner_id !== myId) - Number(b.owner_id !== myId) || a.sort - b.sort || a.name.localeCompare(b.name, 'cs'))
    const sortedEntries = entries
      .slice()
      .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at))
    const chapterById = new Map(chapters.map((c) => [c.id, c]))

    return {
      chapters: sortedChapters,
      entries: sortedEntries,
      loading,
      error,
      chapterById,
      async saveChapter(id, patch) {
        if (!hh) throw new JournalError('Chybí domácnost.')
        const q = id
          ? supabase.from('journal_chapters').update(patch).eq('id', id)
          : supabase.from('journal_chapters').insert({ ...patch, household_id: hh })
        const { data, error } = await q.select().single()
        if (error) throw new JournalError(errorMessage(error))
        setChapters((l) => upsert(l, data))
        return data
      },
      async removeChapter(id) {
        const own = entries.filter((e) => e.chapter_id === id).flatMap((e) => e.photo_paths)
        const { error } = await supabase.from('journal_chapters').delete().eq('id', id)
        if (error) throw new JournalError(errorMessage(error))
        if (own.length) await supabase.storage.from(JOURNAL_BUCKET).remove(own)
        setChapters((l) => l.filter((c) => c.id !== id))
        setEntries((l) => l.filter((e) => e.chapter_id !== id))
      },
      async saveEntry(id, data, photos) {
        if (!hh || !myId) throw new JournalError('Chybí domácnost.')
        const q = id
          ? supabase.from('journal_entries').update(data).eq('id', id)
          : supabase.from('journal_entries').insert({ ...data, household_id: hh })
        const { data: row, error } = await q.select().single()
        if (error) throw new JournalError(errorMessage(error))
        let saved = row
        if (photos) {
          const uploaded: string[] = []
          for (const blob of photos.add) {
            const small = await shrinkImage(blob)
            const path = `${hh}/${myId}/${row.id}/${crypto.randomUUID()}.jpg`
            const up = await supabase.storage.from(JOURNAL_BUCKET).upload(path, small, { contentType: 'image/jpeg' })
            if (up.error) throw new JournalError(`Fotku se nepodařilo nahrát: ${errorMessage(up.error)}`)
            uploaded.push(path)
          }
          const removed = row.photo_paths.filter((p) => !photos.keep.includes(p))
          const next = [...photos.keep, ...uploaded]
          if (uploaded.length || removed.length) {
            const res = await supabase.from('journal_entries').update({ photo_paths: next }).eq('id', row.id).select().single()
            if (res.error) throw new JournalError(errorMessage(res.error))
            saved = res.data
            if (removed.length) await supabase.storage.from(JOURNAL_BUCKET).remove(removed)
          }
        }
        setEntries((l) => upsert(l, saved))
        return saved
      },
      async updateEntry(id, patch) {
        const { data, error } = await supabase.from('journal_entries').update(patch).eq('id', id).select().single()
        if (error) throw new JournalError(errorMessage(error))
        setEntries((l) => upsert(l, data))
      },
      async removeEntry(entry) {
        const { error } = await supabase.from('journal_entries').delete().eq('id', entry.id)
        if (error) throw new JournalError(errorMessage(error))
        if (entry.photo_paths.length) await supabase.storage.from(JOURNAL_BUCKET).remove(entry.photo_paths)
        setEntries((l) => l.filter((e) => e.id !== entry.id))
      },
    }
  }, [chapters, entries, loading, error, hh, myId])

  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>
}

export function useJournal() {
  const ctx = useContext(JournalContext)
  if (!ctx) throw new Error('useJournal mimo JournalProvider')
  return ctx
}
