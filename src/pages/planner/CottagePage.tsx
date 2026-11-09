import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { ArrowLeftRight, Check, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useToast } from '../../components/Toast'
import { Button, Card, ErrorText } from '../../components/ui'
import { useHousehold } from '../../household/HouseholdProvider'
import type { Tables } from '../../lib/database.types'
import { errorMessage, supabase } from '../../lib/supabase'

type CottageItem = Tables<'cottage_items'>
type Direction = 'to_cottage' | 'to_prague'

const DIRECTION: Record<Direction, { label: string; icon: string; placeholder: string; empty: string }> = {
  to_cottage: {
    label: 'Na chatu',
    icon: '🏡',
    placeholder: 'Vzít na chatu… (např. dřevěné uhlí)',
    empty: 'Co vzít z Prahy na chatu? Piš sem průběžně, jak tě něco napadne.',
  },
  to_prague: {
    label: 'Do Prahy',
    icon: '🏙️',
    placeholder: 'Odvézt do Prahy… (např. prádlo)',
    empty: 'Co odvézt z chaty zpátky do Prahy?',
  },
}

function readDir(): Direction {
  try {
    return localStorage.getItem('cottage.dir') === 'to_prague' ? 'to_prague' : 'to_cottage'
  } catch {
    return 'to_cottage'
  }
}

/** Věci domácnosti pro chatu (sdílené, realtime). */
function useCottageItems() {
  const { household } = useHousehold()
  const hh = household?.id ?? null
  const [items, setItems] = useState<CottageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!hh) return
    const { data, error } = await supabase.from('cottage_items').select('*').eq('household_id', hh)
    if (error) setError(errorMessage(error))
    else {
      setItems(data)
      setError(null)
    }
    setLoading(false)
  }, [hh])

  const upsertLocal = useCallback((row: CottageItem) => {
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
    const onChange = (p: RealtimePostgresChangesPayload<CottageItem>) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as Partial<CottageItem>).id
        if (id) setItems((list) => list.filter((r) => r.id !== id))
      } else upsertLocal(p.new as CottageItem)
    }
    const filter = `household_id=eq.${hh}`
    const channel = supabase
      .channel(`cottage:${hh}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cottage_items', filter }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cottage_items', filter }, onChange)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cottage_items' }, onChange)
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

  async function add(direction: Direction, text: string) {
    if (!hh) return
    const { data, error } = await supabase.from('cottage_items').insert({ household_id: hh, direction, text }).select().single()
    if (error) throw new Error(errorMessage(error))
    upsertLocal(data)
  }

  async function update(item: CottageItem, patch: Partial<Pick<CottageItem, 'packed' | 'direction'>>) {
    const next = { ...patch, ...(patch.packed !== undefined ? { packed_at: patch.packed ? new Date().toISOString() : null } : {}) }
    upsertLocal({ ...item, ...next })
    const { data, error } = await supabase.from('cottage_items').update(next).eq('id', item.id).select().single()
    if (error) {
      upsertLocal(item)
      throw new Error(errorMessage(error))
    }
    upsertLocal(data)
  }

  async function removeMany(ids: string[]) {
    if (ids.length === 0) return
    const { error } = await supabase.from('cottage_items').delete().in('id', ids)
    if (error) throw new Error(errorMessage(error))
    setItems((list) => list.filter((r) => !ids.includes(r.id)))
  }

  async function unpackMany(ids: string[]) {
    if (ids.length === 0) return
    const { error } = await supabase.from('cottage_items').update({ packed: false, packed_at: null }).in('id', ids)
    if (error) throw new Error(errorMessage(error))
    await reload()
  }

  return { items, loading, error, add, update, removeMany, unpackMany }
}

/** Plánovač → Chata: co vzít na chatu a co z chaty do Prahy. */
export function CottagePage() {
  const { items, loading, error, add, update, removeMany, unpackMany } = useCottageItems()
  const toast = useToast()
  const [dir, setDir] = useState<Direction>(readDir)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const chooseDir = (d: Direction) => {
    setDir(d)
    try {
      localStorage.setItem('cottage.dir', d)
    } catch {
      /* nevadí */
    }
  }

  const ofDir = (d: Direction) => items.filter((i) => i.direction === d)
  const open = ofDir(dir)
    .filter((i) => !i.packed)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const packed = ofDir(dir)
    .filter((i) => i.packed)
    .sort((a, b) => (b.packed_at ?? '').localeCompare(a.packed_at ?? ''))
  const meta = DIRECTION[dir]

  async function submit(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setBusy(true)
    setFormError(null)
    try {
      await add(dir, t)
      setText('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Nepodařilo se přidat.')
    } finally {
      setBusy(false)
    }
  }

  const fail = (e: Error) => toast(e.message, 'error')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(DIRECTION) as Direction[]).map((d) => {
          const count = ofDir(d).filter((i) => !i.packed).length
          return (
            <button
              key={d}
              onClick={() => chooseDir(d)}
              aria-pressed={dir === d}
              className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl px-3 font-semibold ring-1 ${
                dir === d
                  ? 'bg-brand-700 text-white ring-brand-700'
                  : 'bg-white text-neutral-700 ring-neutral-200 dark:bg-neutral-900 dark:text-neutral-300 dark:ring-neutral-800'
              }`}
            >
              <span aria-hidden className="text-xl">
                {DIRECTION[d].icon}
              </span>
              {DIRECTION[d].label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 text-xs ${dir === d ? 'bg-white/25' : 'bg-neutral-100 dark:bg-neutral-800'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <form onSubmit={(e) => void submit(e)} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={meta.placeholder}
          enterKeyHint="done"
          maxLength={120}
          className="block min-h-12 w-full flex-1 rounded-xl border border-neutral-300 bg-white px-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <Button type="submit" aria-label="Přidat" disabled={busy || !text.trim()}>
          <Plus className="size-5" />
        </Button>
      </form>
      <ErrorText>{formError ?? error}</ErrorText>

      {open.length === 0 && !loading ? (
        <Card>
          <p className="text-neutral-500">{packed.length > 0 ? 'Všechno zabaleno 👍' : meta.empty}</p>
        </Card>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
          {open.map((it) => (
            <Row
              key={it.id}
              item={it}
              onToggle={() => void update(it, { packed: true }).catch(fail)}
              onSwap={() =>
                void update(it, { direction: dir === 'to_cottage' ? 'to_prague' : 'to_cottage' })
                  .then(() => toast(`${it.text} → ${DIRECTION[dir === 'to_cottage' ? 'to_prague' : 'to_cottage'].label.toLowerCase()}`))
                  .catch(fail)
              }
              onDelete={() => void removeMany([it.id]).catch(fail)}
            />
          ))}
        </ul>
      )}

      {packed.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-neutral-500">Zabaleno ({packed.length})</h2>
            <Button
              variant="ghost"
              className="min-h-10 text-sm"
              title="Vrátit vše mezi nezabalené – na příští cestu"
              onClick={() => void unpackMany(packed.map((i) => i.id)).catch(fail)}
            >
              <RotateCcw className="size-4" /> Znovu příště
            </Button>
            <Button variant="ghost" className="min-h-10 text-sm" onClick={() => void removeMany(packed.map((i) => i.id)).catch(fail)}>
              <Trash2 className="size-4" /> Smazat
            </Button>
          </div>
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white opacity-70 ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
            {packed.map((it) => (
              <Row
                key={it.id}
                item={it}
                onToggle={() => void update(it, { packed: false }).catch(fail)}
                onDelete={() => void removeMany([it.id]).catch(fail)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Row({
  item,
  onToggle,
  onSwap,
  onDelete,
}: {
  item: CottageItem
  onToggle: () => void
  onSwap?: () => void
  onDelete: () => void
}) {
  const { members } = useHousehold()
  const adder = members.length > 1 ? members.find((m) => m.user_id === item.added_by) : undefined
  return (
    <li className="flex min-h-14 items-center">
      <button
        aria-label={item.packed ? `Vrátit: ${item.text}` : `Zabaleno: ${item.text}`}
        onClick={onToggle}
        className="flex size-14 shrink-0 items-center justify-center"
      >
        <span
          className={`flex size-7 items-center justify-center rounded-full ring-2 ${
            item.packed ? 'bg-brand-700 text-white ring-brand-700' : 'ring-neutral-300 dark:ring-neutral-600'
          }`}
        >
          {item.packed && <Check className="size-4" />}
        </span>
      </button>
      <button onClick={onToggle} className="min-w-0 flex-1 py-2 pr-2 text-left">
        <span className={`block font-medium ${item.packed ? 'line-through' : ''}`}>{item.text}</span>
        {adder && <span className="block text-sm text-neutral-500">{adder.display_name}</span>}
      </button>
      {onSwap && (
        <button
          onClick={onSwap}
          aria-label="Přesunout na druhý seznam"
          title="Přesunout na druhý seznam"
          className="flex size-12 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-700"
        >
          <ArrowLeftRight className="size-5" />
        </button>
      )}
      <button
        onClick={onDelete}
        aria-label={`Smazat ${item.text}`}
        className="flex size-12 shrink-0 items-center justify-center text-neutral-400 hover:text-red-600"
      >
        <X className="size-5" />
      </button>
    </li>
  )
}
