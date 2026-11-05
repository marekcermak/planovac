import { Map as MapIcon, List, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useToast } from '../components/Toast'
import { Card, Chip, ErrorText, PageHeader } from '../components/ui'
import { fold } from '../lib/text'
import { ActionError, useStockActions } from '../stock/actions'
import { daysLeft, expiryLevel } from '../stock/expiry'
import { ItemRow, byExpiry } from '../stock/ItemRow'
import { ItemSheet } from '../stock/ItemSheet'
import { useStock } from '../stock/StockProvider'
import { ZoneMap } from '../stock/ZoneMap'

type View = 'list' | 'map'
type ExpiryFilter = '' | 'expired' | 'today' | 'soon'

function matchesExpiry(days: number | null, f: ExpiryFilter, warnDays: number): boolean {
  if (f === 'expired') return days !== null && days < 0
  if (f === 'today') return days === 0
  const lvl = expiryLevel(days, warnDays)
  return lvl === 'expired' || lvl === 'soon'
}

export function StockPage() {
  const { items, zones, locationById, productById, categories, warnDays, locationName, loading, error } = useStock()
  const actions = useStockActions()
  const toast = useToast()
  const [zoneId, setZoneId] = useState<string | null>(null)
  const [locationId, setLocationId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string>('')
  // Výchozí filtr z odkazu z přehledu na Dnes (?filtr=prosle|dnes|prochazi|otevrene).
  const [params] = useSearchParams()
  const initial = params.get('filtr')
  const [expiry, setExpiry] = useState<ExpiryFilter>(
    initial === 'prosle' ? 'expired' : initial === 'dnes' ? 'today' : initial === 'prochazi' ? 'soon' : '',
  )
  const [onlyOpened, setOnlyOpened] = useState(initial === 'otevrene')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>('list')
  const [openItem, setOpenItem] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // PC: „/“ = hledání (SPEC 5.1).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const q = fold(query)

  // Položky po filtrech kromě vybrané buňky (ta se aplikuje až na seznam).
  const filtered = useMemo(
    () =>
      items.filter((i) => {
        const product = productById.get(i.product_id)
        if (zoneId && (i.location_id ? locationById.get(i.location_id)?.zone_id : null) !== zoneId) return false
        if (categoryId && product?.category_id !== categoryId) return false
        if (onlyOpened && !i.opened_on) return false
        if (expiry && !matchesExpiry(daysLeft(i.expires_on), expiry, warnDays)) return false
        if (q && !fold(product?.name ?? '').includes(q)) return false
        return true
      }),
    [items, productById, locationById, zoneId, categoryId, onlyOpened, expiry, q, warnDays],
  )

  const listItems = filtered.filter((i) => !locationId || i.location_id === locationId).sort(byExpiry)
  const highlight = useMemo(
    () => new Set(q ? filtered.map((i) => i.location_id).filter((l): l is string => !!l) : []),
    [filtered, q],
  )
  const shownZones = zoneId ? zones.filter((z) => z.id === zoneId) : zones

  async function drop(itemId: string, locId: string) {
    const item = items.find((i) => i.id === itemId)
    if (!item || item.location_id === locId) return
    try {
      await actions.move(itemId, locId)
      toast(`${productById.get(item.product_id)?.name ?? 'Položka'} → ${locationName(locId)}`)
    } catch (e) {
      toast(e instanceof ActionError ? e.message : 'Přesun se nepovedl.', 'error')
    }
  }

  function selectCell(id: string) {
    setLocationId((cur) => (cur === id ? null : id))
  }

  const maps = (
    <div className="space-y-4">
      {shownZones.map((z) => (
        <section key={z.id}>
          {shownZones.length > 1 && <h2 className="mb-1.5 text-sm font-semibold text-neutral-500">{z.name}</h2>}
          <ZoneMap
            zone={z}
            items={filtered}
            selectedId={locationId}
            highlight={highlight}
            onSelect={selectCell}
            onDropItem={(itemId, loc) => void drop(itemId, loc)}
          />
        </section>
      ))}
    </div>
  )

  const list = (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
      {locationId && (
        <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
          <span className="flex-1 font-medium">{locationName(locationId)}</span>
          <button className="flex items-center gap-1 text-neutral-500" onClick={() => setLocationId(null)}>
            <X className="size-4" /> zrušit
          </button>
        </div>
      )}
      {listItems.length === 0 ? (
        <p className="px-4 py-6 text-center text-neutral-500">
          {items.length === 0 ? 'Sklad je prázdný.' : 'Nic tu neodpovídá filtru.'}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {listItems.map((i) => (
            <li key={i.id}>
              <ItemRow item={i} onOpen={setOpenItem} showLocation={!locationId} draggable />
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <>
      <PageHeader title="Sklad" subtitle={loading ? 'Načítám…' : `${items.length} položek`} />
      <ErrorText>{error}</ErrorText>

      {!loading && items.length === 0 && (
        <Card className="mb-4">
          <p className="mb-2">Sklad je zatím prázdný.</p>
          <Link to="/pridat" className="font-medium text-brand-700 dark:text-brand-500">
            Přidat první potravinu →
          </Link>
        </Card>
      )}

      <div className="mb-3 space-y-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-neutral-400" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Kde je…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="block min-h-12 w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-10 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
          <Chip
            active={zoneId === null}
            onClick={() => {
              setZoneId(null)
              setLocationId(null)
            }}
          >
            Vše
          </Chip>
          {zones.map((z) => (
            <Chip
              key={z.id}
              active={zoneId === z.id}
              onClick={() => {
                setZoneId(z.id)
                setLocationId(null)
              }}
            >
              {z.name}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-neutral-300 dark:bg-neutral-700" />
          <Chip active={expiry !== ''} onClick={() => setExpiry((v) => (v ? '' : 'soon'))}>
            {expiry === 'expired' ? 'Prošlé' : expiry === 'today' ? 'Prochází dnes' : 'Prochází'}
          </Chip>
          <Chip active={onlyOpened} onClick={() => setOnlyOpened((v) => !v)}>
            Otevřené
          </Chip>
          <select
            aria-label="Kategorie"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="min-h-10 shrink-0 rounded-full bg-white px-3 text-sm font-medium ring-1 ring-neutral-300 dark:bg-neutral-900 dark:ring-neutral-700"
          >
            <option value="">Všechny kategorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mobil: přepínač seznam / mapa */}
      <div className="mb-3 grid grid-cols-2 rounded-xl bg-neutral-200/70 p-1 lg:hidden dark:bg-neutral-800">
        {(
          [
            ['list', 'Seznam', List],
            ['map', 'Mapa', MapIcon],
          ] as const
        ).map(([v, label, Icon]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium ${
              view === v ? 'bg-white shadow-sm dark:bg-neutral-700' : 'text-neutral-600 dark:text-neutral-400'
            }`}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {/* Mobil */}
      <div className="lg:hidden">
        {view === 'list' ? (
          list
        ) : (
          <div className="space-y-4">
            {maps}
            {locationId && list}
          </div>
        )}
      </div>

      {/* PC: mapa a seznam vedle sebe */}
      <div className="hidden gap-6 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>{maps}</div>
        <div>
          {list}
          <p className="mt-2 text-xs text-neutral-500">Tip: položku přesuneš přetažením myší na buňku mapy.</p>
        </div>
      </div>

      <ItemSheet itemId={openItem} onClose={() => setOpenItem(null)} />
    </>
  )
}
