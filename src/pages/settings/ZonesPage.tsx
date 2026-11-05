import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Minus, Plus, Trash2 } from 'lucide-react'
import { useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useToast } from '../../components/Toast'
import { Button, Card, ErrorText, Field, PageHeader, SelectField } from '../../components/ui'
import { useHousehold } from '../../household/HouseholdProvider'
import { errorMessage, supabase } from '../../lib/supabase'
import { useStock, type Location, type Zone } from '../../stock/StockProvider'

export const ZONE_TYPES: Record<string, string> = {
  fridge: 'Lednice',
  freezer: 'Mrazák',
  pantry: 'Spíž',
  other: 'Jiné',
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="mb-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-neutral-500">
      <ChevronLeft className="size-4" /> {label}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Seznam zón
// ---------------------------------------------------------------------------

export function ZonesPage() {
  const { household } = useHousehold()
  const { zones, locations, upsertLocal } = useStock()
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [type, setType] = useState('pantry')
  const [error, setError] = useState<string | null>(null)

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!household) return
    const { data, error } = await supabase
      .from('zones')
      .insert({
        household_id: household.id,
        name: name.trim(),
        type,
        grid_rows: 3,
        grid_cols: 2,
        sort: (zones.at(-1)?.sort ?? 0) + 1,
      })
      .select()
      .single()
    if (error) return setError(errorMessage(error))
    upsertLocal('zones', data)
    navigate(`/vice/nastaveni/zony/${data.id}`)
  }

  async function swap(a: Zone, b: Zone) {
    const [r1, r2] = await Promise.all([
      supabase.from('zones').update({ sort: b.sort }).eq('id', a.id).select().single(),
      supabase.from('zones').update({ sort: a.sort === b.sort ? a.sort + 1 : a.sort }).eq('id', b.id).select().single(),
    ])
    if (r1.error || r2.error) return toast(errorMessage(r1.error ?? r2.error), 'error')
    upsertLocal('zones', r1.data)
    upsertLocal('zones', r2.data)
  }

  return (
    <div className="max-w-2xl">
      <BackLink to="/vice/nastaveni" label="Nastavení" />
      <PageHeader title="Zóny a mřížky" subtitle="Lednice, mrazák, spíž… a jejich police." />
      <ul className="mb-6 divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
        {zones.map((z, i) => (
          <li key={z.id} className="flex items-center">
            <Link to={`/vice/nastaveni/zony/${z.id}`} className="flex min-h-14 flex-1 items-center gap-3 px-4">
              <span className="flex-1">
                <span className="block font-medium">{z.name}</span>
                <span className="block text-sm text-neutral-500">
                  {ZONE_TYPES[z.type]} · {z.grid_rows} × {z.grid_cols} ·{' '}
                  {locations.filter((l) => l.zone_id === z.id).length} míst
                </span>
              </span>
              <ChevronRight className="size-5 text-neutral-400" />
            </Link>
            <div className="flex flex-col pr-2">
              <button
                aria-label="Posunout nahoru"
                disabled={i === 0}
                onClick={() => void swap(z, zones[i - 1])}
                className="p-1 text-neutral-400 disabled:opacity-30"
              >
                <ArrowUp className="size-4" />
              </button>
              <button
                aria-label="Posunout dolů"
                disabled={i === zones.length - 1}
                onClick={() => void swap(z, zones[i + 1])}
                className="p-1 text-neutral-400 disabled:opacity-30"
              >
                <ArrowDown className="size-4" />
              </button>
            </div>
          </li>
        ))}
        {zones.length === 0 && <li className="px-4 py-6 text-center text-neutral-500">Zatím žádné zóny.</li>}
      </ul>

      <Card title="Nová zóna">
        <form onSubmit={create} className="space-y-3">
          <Field label="Název" required maxLength={60} placeholder="např. Spíž – regál B" value={name} onChange={(e) => setName(e.target.value)} />
          <SelectField label="Typ" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(ZONE_TYPES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={!name.trim()}>
            <Plus className="size-5" /> Založit a nakreslit
          </Button>
        </form>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editor jedné zóny
// ---------------------------------------------------------------------------

type Rect = { r0: number; c0: number; r1: number; c1: number }

function norm(a: { r: number; c: number }, b: { r: number; c: number }): Rect {
  return { r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) }
}

function locRect(l: Location): Rect {
  return { r0: l.row, c0: l.col, r1: l.row + l.row_span - 1, c1: l.col + l.col_span - 1 }
}

function overlaps(a: Rect, b: Rect) {
  return a.r0 <= b.r1 && b.r0 <= a.r1 && a.c0 <= b.c1 && b.c0 <= a.c1
}

function sameRect(a: Rect, b: Rect) {
  return a.r0 === b.r0 && a.c0 === b.c0 && a.r1 === b.r1 && a.c1 === b.c1
}

export function ZoneEditorPage() {
  const { id } = useParams()
  const { zones } = useStock()
  const zone = zones.find((z) => z.id === id)
  if (!zone) {
    return (
      <div className="max-w-2xl">
        <BackLink to="/vice/nastaveni/zony" label="Zóny" />
        <p className="text-neutral-500">Zóna nenalezena.</p>
      </div>
    )
  }
  return <ZoneEditor key={zone.id} zone={zone} />
}

function ZoneEditor({ zone }: { zone: Zone }) {
  const { locations, items, products, upsertLocal, removeLocal, refreshItem } = useStock()
  const navigate = useNavigate()
  const toast = useToast()
  const zoneLocs = locations.filter((l) => l.zone_id === zone.id)
  const [name, setName] = useState(zone.name)
  const [sel, setSel] = useState<Rect | null>(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const anchor = useRef<{ r: number; c: number } | null>(null)

  const exactLoc = sel ? zoneLocs.find((l) => sameRect(locRect(l), sel)) : undefined
  const hit = sel ? zoneLocs.filter((l) => overlaps(locRect(l), sel)) : []

  async function saveZone(patch: Partial<Pick<Zone, 'name' | 'type' | 'grid_rows' | 'grid_cols'>>) {
    setError(null)
    const { data, error } = await supabase.from('zones').update(patch).eq('id', zone.id).select().single()
    if (error) return setError(errorMessage(error))
    upsertLocal('zones', data)
  }

  function resize(dRows: number, dCols: number) {
    const rows = zone.grid_rows + dRows
    const cols = zone.grid_cols + dCols
    if (rows < 1 || cols < 1 || rows > 12 || cols > 8) return
    const cut = zoneLocs.filter((l) => l.row + l.row_span > rows || l.col + l.col_span > cols)
    if (cut.length > 0) {
      return setError(`Nejdřív smaž nebo zmenši místa na kraji: ${cut.map((l) => l.label).join(', ')}.`)
    }
    setSel(null)
    void saveZone({ grid_rows: rows, grid_cols: cols })
  }

  // --- výběr buněk tažením (prst i myš) ---
  function cellAt(e: ReactPointerEvent): { r: number; c: number } | null {
    const el = gridRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * zone.grid_cols)
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * zone.grid_rows)
    if (r < 0 || c < 0 || r >= zone.grid_rows || c >= zone.grid_cols) return null
    return { r, c }
  }

  function onDown(e: ReactPointerEvent) {
    const cell = cellAt(e)
    if (!cell) return
    e.currentTarget.setPointerCapture(e.pointerId)
    // Ťuknutí na existující místo vybere celé místo.
    const loc = zoneLocs.find((l) => overlaps(locRect(l), { r0: cell.r, c0: cell.c, r1: cell.r, c1: cell.c }))
    anchor.current = cell
    const r = loc ? locRect(loc) : norm(cell, cell)
    setSel(r)
    setLabel(loc?.label ?? '')
    setError(null)
  }

  function onMove(e: ReactPointerEvent) {
    if (!anchor.current) return
    const cell = cellAt(e)
    if (!cell) return
    if (cell.r === anchor.current.r && cell.c === anchor.current.c) return
    const r = norm(anchor.current, cell)
    setSel(r)
    const exact = zoneLocs.find((l) => sameRect(locRect(l), r))
    setLabel(exact?.label ?? '')
  }

  function onUp() {
    anchor.current = null
  }

  async function createLocation(e: FormEvent) {
    e.preventDefault()
    if (!sel) return
    setBusy(true)
    setError(null)
    try {
      if (exactLoc) {
        const { data, error } = await supabase
          .from('locations')
          .update({ label: label.trim() })
          .eq('id', exactLoc.id)
          .select()
          .single()
        if (error) throw error
        upsertLocal('locations', data)
        toast('Místo přejmenováno')
        return
      }
      const { data: created, error } = await supabase
        .from('locations')
        .insert({
          household_id: zone.household_id,
          zone_id: zone.id,
          label: label.trim(),
          row: sel.r0,
          col: sel.c0,
          row_span: sel.r1 - sel.r0 + 1,
          col_span: sel.c1 - sel.c0 + 1,
        })
        .select()
        .single()
      if (error) throw error
      upsertLocal('locations', created)

      // Sloučená místa: položky a výchozí místa produktů převést na nové místo.
      const oldIds = new Set(hit.map((l) => l.id))
      for (const it of items.filter((i) => i.location_id && oldIds.has(i.location_id))) {
        const { error } = await supabase.rpc('move_stock', { p_item_id: it.id, p_location_id: created.id })
        if (error) throw error
      }
      for (const p of products.filter((p) => p.default_location_id && oldIds.has(p.default_location_id))) {
        const { data } = await supabase.from('products').update({ default_location_id: created.id }).eq('id', p.id).select().single()
        if (data) upsertLocal('products', data)
      }
      if (oldIds.size > 0) {
        const { error } = await supabase.from('locations').delete().in('id', [...oldIds])
        if (error) throw error
        oldIds.forEach((id) => removeLocal('locations', id))
        await Promise.all(items.filter((i) => i.location_id && oldIds.has(i.location_id)).map((i) => refreshItem(i.id)))
      }
      toast(oldIds.size > 0 ? `Sloučeno do „${created.label}“` : `Místo „${created.label}“ přidáno`)
      setSel(null)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function deleteLocation() {
    if (!exactLoc) return
    const { error } = await supabase.from('locations').delete().eq('id', exactLoc.id)
    if (error) return setError(errorMessage(error))
    removeLocal('locations', exactLoc.id)
    await Promise.all(items.filter((i) => i.location_id === exactLoc.id).map((i) => refreshItem(i.id)))
    setSel(null)
    toast('Místo smazáno')
  }

  async function fillEmpty() {
    const covered = new Set<string>()
    for (const l of zoneLocs) {
      const r = locRect(l)
      for (let y = r.r0; y <= r.r1; y++) for (let x = r.c0; x <= r.c1; x++) covered.add(`${y},${x}`)
    }
    const rows = []
    for (let y = 0; y < zone.grid_rows; y++) {
      for (let x = 0; x < zone.grid_cols; x++) {
        if (covered.has(`${y},${x}`)) continue
        rows.push({
          household_id: zone.household_id,
          zone_id: zone.id,
          label: zone.grid_cols > 1 ? `Police ${y + 1} – ${x + 1}` : `Police ${y + 1}`,
          row: y,
          col: x,
        })
      }
    }
    if (rows.length === 0) return toast('Všechny buňky už jsou místa')
    const { data, error } = await supabase.from('locations').insert(rows).select()
    if (error) return setError(errorMessage(error))
    data.forEach((l) => upsertLocal('locations', l))
  }

  async function deleteZone() {
    const { error } = await supabase.from('zones').delete().eq('id', zone.id)
    if (error) return setError(errorMessage(error))
    removeLocal('zones', zone.id)
    zoneLocs.forEach((l) => removeLocal('locations', l.id))
    navigate('/vice/nastaveni/zony', { replace: true })
  }

  const inZone = items.filter((i) => zoneLocs.some((l) => l.id === i.location_id)).length

  return (
    <div className="max-w-3xl">
      <BackLink to="/vice/nastaveni/zony" label="Zóny" />
      <PageHeader title={zone.name} subtitle="Tažením prstem nebo myší vyber buňky a pojmenuj místo." />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <div
            ref={gridRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="relative grid touch-none gap-1.5 rounded-2xl bg-neutral-200/60 p-1.5 select-none dark:bg-neutral-800/60"
            style={{
              gridTemplateColumns: `repeat(${zone.grid_cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${zone.grid_rows}, 3.75rem)`,
            }}
          >
            {Array.from({ length: zone.grid_rows * zone.grid_cols }, (_, i) => (
              <div
                key={`c${i}`}
                className="rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-700"
                style={{ gridRow: Math.floor(i / zone.grid_cols) + 1, gridColumn: (i % zone.grid_cols) + 1 }}
              />
            ))}
            {zoneLocs.map((l) => (
              <div
                key={l.id}
                className="z-10 flex items-center justify-center rounded-xl bg-white p-1 text-center text-xs font-semibold text-neutral-700 ring-1 ring-neutral-300 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-neutral-700"
                style={{
                  gridRow: `${l.row + 1} / span ${l.row_span}`,
                  gridColumn: `${l.col + 1} / span ${l.col_span}`,
                }}
              >
                <span className="line-clamp-2">{l.label}</span>
              </div>
            ))}
            {sel && (
              <div
                className="pointer-events-none z-20 rounded-xl bg-brand-600/25 ring-[3px] ring-brand-600"
                style={{
                  gridRow: `${sel.r0 + 1} / ${sel.r1 + 2}`,
                  gridColumn: `${sel.c0 + 1} / ${sel.c1 + 2}`,
                }}
              />
            )}
          </div>

          {sel && (
            <form onSubmit={createLocation} className="mt-4 space-y-3 rounded-2xl bg-white p-4 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
              <Field
                label={exactLoc ? 'Název místa' : 'Nové místo'}
                required
                maxLength={60}
                placeholder="např. Police 2 – vlevo"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              {!exactLoc && hit.length > 0 && (
                <p className="text-sm text-orange-700 dark:text-orange-400">
                  Sloučí: {hit.map((l) => l.label).join(', ')}. Jejich obsah se přesune sem.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || !label.trim()}>
                  {exactLoc ? 'Přejmenovat' : hit.length > 0 ? 'Sloučit' : 'Vytvořit místo'}
                </Button>
                {exactLoc && (
                  <Button type="button" variant="danger" onClick={() => void deleteLocation()}>
                    <Trash2 className="size-5" /> Smazat místo
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={() => setSel(null)}>
                  Zrušit
                </Button>
              </div>
              {exactLoc && items.some((i) => i.location_id === exactLoc.id) && (
                <p className="text-sm text-neutral-500">Po smazání zůstanou položky odtud „bez místa“.</p>
              )}
            </form>
          )}
          <ErrorText>{error}</ErrorText>
        </div>

        <div className="space-y-4">
          <Card title="Zóna">
            <div className="space-y-3">
              <Field
                label="Název"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && name !== zone.name && void saveZone({ name: name.trim() })}
              />
              <SelectField label="Typ" value={zone.type} onChange={(e) => void saveZone({ type: e.target.value })}>
                {Object.entries(ZONE_TYPES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </SelectField>
              <Stepper label="Police (řádky)" value={zone.grid_rows} onChange={(d) => resize(d, 0)} />
              <Stepper label="Sloupce" value={zone.grid_cols} onChange={(d) => resize(0, d)} />
              <Button variant="secondary" className="w-full" onClick={() => void fillEmpty()}>
                Vyplnit prázdné buňky
              </Button>
            </div>
          </Card>
          {confirmDelete ? (
            <div className="space-y-2 rounded-2xl bg-red-50 p-4 text-sm dark:bg-red-950">
              <p>
                Smazat zónu <strong>{zone.name}</strong> se všemi místy?
                {inZone > 0 && ` ${inZone} položek zůstane „bez místa“.`}
              </p>
              <div className="flex gap-2">
                <Button variant="danger" onClick={() => void deleteZone()}>
                  Smazat
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Ne
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-5" /> Smazat zónu
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (delta: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`${label} −`}
          onClick={() => onChange(-1)}
          className="flex size-10 items-center justify-center rounded-full ring-1 ring-neutral-300 dark:ring-neutral-700"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-6 text-center font-semibold">{value}</span>
        <button
          type="button"
          aria-label={`${label} +`}
          onClick={() => onChange(1)}
          className="flex size-10 items-center justify-center rounded-full ring-1 ring-neutral-300 dark:ring-neutral-700"
        >
          <Plus className="size-4" />
        </button>
      </span>
    </div>
  )
}
