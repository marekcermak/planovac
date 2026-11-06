import { Plus, ScanBarcode, Search, Zap } from 'lucide-react'
import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Button, Card, ErrorText, Field, PageHeader, SelectField } from '../components/ui'
import { useHousehold } from '../household/HouseholdProvider'
import { errorMessage, supabase } from '../lib/supabase'
import { fold } from '../lib/text'
import { ActionError, useStockActions } from '../stock/actions'
import { addDays, formatDate, formatQty, todayIso, UNITS } from '../stock/expiry'
import { useKitchen } from '../kitchen/KitchenProvider'
import { guessCategory, lookupBarcode, offProductName } from '../stock/barcode'
import { LocationPicker } from '../stock/LocationPicker'
import { ScannerSheet } from '../stock/Scanner'
import { useStock, type Product } from '../stock/StockProvider'

type Added = { id: string; name: string; qty: string; where: string }

/** Cíl formuláře: existující produkt, nebo nový (předvyplněný z hledání či ze skenu). */
type Target =
  | { product: Product }
  | { newName: string; barcode?: string; categoryId?: string | null; imageUrl?: string; notice?: string }

export function AddPage() {
  const { products, categories, categoryById, locationName, loading } = useStock()
  const actions = useStockActions()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<Target | null>(null)
  const [added, setAdded] = useState<Added[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)

  const onCode = useCallback(
    async (code: string) => {
      setScanning(false)
      const own = products.find((p) => p.barcode === code)
      if (own) {
        if (own.archived) toast(`${own.name} je v archivu produktů – přidávám i tak.`)
        setTarget({ product: own })
        return
      }
      setLookingUp(true)
      try {
        const off = await lookupBarcode(code)
        setTarget(
          off.found
            ? {
                newName: [off.brand && !fold(off.name ?? '').includes(fold(off.brand)) ? off.brand : '', offProductName(off)]
                  .filter(Boolean)
                  .join(' '),
                barcode: code,
                categoryId: guessCategory(off.categories, categories),
                imageUrl: off.image_url,
                notice: 'Předvyplněno z Open Food Facts – zkontroluj název a kategorii.',
              }
            : { newName: '', barcode: code, notice: `Kód ${code} jsme v databázi nenašli. Vyplň název – příště ho už poznáme.` },
        )
      } catch (e) {
        setTarget({ newName: '', barcode: code, notice: e instanceof Error ? e.message : String(e) })
      } finally {
        setLookingUp(false)
      }
    },
    [products, categories, toast],
  )

  const active = useMemo(() => products.filter((p) => !p.archived), [products])
  const quick = active.filter((p) => p.is_quick_add)
  const q = fold(query)
  const matches = q ? active.filter((p) => fold(p.name).includes(q)) : active.filter((p) => !p.is_quick_add)
  const exact = q && active.some((p) => fold(p.name) === q)

  function remember(name: string, qty: string, where: string, id: string) {
    setAdded((a) => [{ id, name, qty, where }, ...a])
    toast(`Přidáno: ${name} → ${where}`)
  }

  async function quickAdd(p: Product) {
    setBusyId(p.id)
    try {
      const id = await actions.add({ productId: p.id })
      remember(p.name, formatQty(p.default_qty, p.default_unit), locationName(p.default_location_id), id)
    } catch (e) {
      toast(e instanceof ActionError ? e.message : 'Přidání se nepovedlo.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Přidat do skladu" subtitle="Ťukni na oblíbenou položku, nebo vyhledej či založ novou." />

      <div className="mb-4 flex gap-2">
      <label className="relative block flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          autoFocus={window.matchMedia('(min-width: 1024px)').matches}
          placeholder="Co přidáváš? (např. mléko)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query.trim()) {
              const first = matches[0]
              setTarget(first && fold(first.name) === q ? { product: first } : { newName: query.trim() })
            }
          }}
          className="block min-h-12 w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-10 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
        <Button variant="secondary" disabled={lookingUp} onClick={() => setScanning(true)} aria-label="Skenovat čárový kód">
          <ScanBarcode className="size-5" />
          <span className="hidden sm:inline">{lookingUp ? 'Hledám…' : 'Skenovat'}</span>
        </Button>
      </div>
      {lookingUp && <p className="-mt-2 mb-4 text-sm text-neutral-500">Hledám produkt podle kódu…</p>}

      {!q && quick.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-neutral-500">
            <Zap className="size-4" /> Rychlé přidání
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {quick.map((p) => (
              <button
                key={p.id}
                disabled={busyId === p.id}
                onClick={() => void quickAdd(p)}
                className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-white p-2 text-center ring-1 ring-neutral-200 active:scale-95 disabled:opacity-50 dark:bg-neutral-900 dark:ring-neutral-800"
              >
                <span className="text-2xl" aria-hidden>
                  {(p.category_id && categoryById.get(p.category_id)?.icon) || '🍽️'}
                </span>
                <span className="line-clamp-2 text-sm leading-tight font-medium">{p.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!q && quick.length === 0 && !loading && (
        <Card className="mb-5">
          <p className="text-neutral-600 dark:text-neutral-400">
            Napiš název potraviny a založ ji. U produktů, které kupuješ často, zapni <strong>Rychlé přidání</strong>{' '}
            – pak je tu přidáš jedním ťuknutím.
          </p>
        </Card>
      )}

      {(q || matches.length > 0) && (
        <section className="mb-5">
          {!q && <h2 className="mb-2 text-sm font-semibold text-neutral-500">Ostatní produkty</h2>}
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
            {q && !exact && (
              <li>
                <button
                  onClick={() => setTarget({ newName: query.trim() })}
                  className="flex min-h-14 w-full items-center gap-3 px-3 text-left font-medium text-brand-700 hover:bg-neutral-50 dark:text-brand-500 dark:hover:bg-neutral-800"
                >
                  <Plus className="size-5" /> Nový produkt „{query.trim()}“
                </button>
              </li>
            )}
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setTarget({ product: p })}
                  className="flex min-h-14 w-full items-center gap-3 px-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  <span className="text-2xl" aria-hidden>
                    {(p.category_id && categoryById.get(p.category_id)?.icon) || '🍽️'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate text-sm text-neutral-500">
                      {formatQty(p.default_qty, p.default_unit)} · {locationName(p.default_location_id)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {added.length > 0 && (
        <Card
          title={
            <span className="flex items-center">
              <span className="flex-1">Právě přidáno ({added.length})</span>
              <button className="text-sm font-medium text-neutral-500" onClick={() => setAdded([])}>
                Hotovo
              </button>
            </span>
          }
        >
          <ul className="space-y-1 text-sm">
            {added.map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="flex-1 truncate font-medium">{a.name}</span>
                <span className="text-neutral-500">{a.qty}</span>
                <span className="w-40 truncate text-right text-neutral-500">{a.where}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ScannerSheet open={scanning} onClose={() => setScanning(false)} onCode={(c) => void onCode(c)} />

      <Sheet open={target !== null} onClose={() => setTarget(null)} title={target && 'product' in target ? target.product.name : 'Nový produkt'}>
        {target && (
          <AddForm
            key={'product' in target ? target.product.id : `new:${target.barcode ?? ''}:${target.newName}`}
            target={target}
            onSwitch={setTarget}
            onDone={(name, qty, where, id) => {
              remember(name, qty, where, id)
              setTarget(null)
              setQuery('')
            }}
          />
        )}
      </Sheet>
    </div>
  )
}

function AddForm({
  target,
  onDone,
  onSwitch,
}: {
  target: Target
  onDone: (name: string, qty: string, where: string, id: string) => void
  onSwitch: (t: Target) => void
}) {
  const { household } = useHousehold()
  const { categories, categoryById, locationName, upsertLocal, products } = useStock()
  const { index } = useKitchen()
  const actions = useStockActions()
  const existing = 'product' in target ? target.product : null
  const scanned = 'product' in target ? null : target

  const [name, setName] = useState(existing?.name ?? scanned?.newName ?? '')
  const [categoryId, setCategoryId] = useState(existing?.category_id ?? scanned?.categoryId ?? '')
  const [qty, setQty] = useState(String(existing?.default_qty ?? 1))
  const [unit, setUnit] = useState(existing?.default_unit ?? 'ks')
  const [locationId, setLocationId] = useState<string | null>(existing?.default_location_id ?? null)
  const [labelDate, setLabelDate] = useState('')
  const [shelf, setShelf] = useState('')
  const [quickAdd, setQuickAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const category = categoryId ? categoryById.get(categoryId) : undefined
  const ownShelf = existing ? existing.shelf_life_days : shelf ? Number(shelf) : null
  const effectiveShelf = ownShelf ?? category?.default_shelf_life_days ?? null
  const estimate = effectiveShelf != null ? addDays(todayIso(), effectiveShelf) : null
  const quantity = Number(qty.replace(',', '.'))

  async function attachBarcode(productId: string) {
    if (!productId || !scanned?.barcode) return
    const { data, error } = await supabase
      .from('products')
      .update({ barcode: scanned.barcode })
      .eq('id', productId)
      .select()
      .single()
    if (error) return setError(errorMessage(error))
    upsertLocal('products', data)
    onSwitch({ product: data })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!household) return
    if (!(quantity > 0)) return setError('Zadej množství.')
    setBusy(true)
    setError(null)
    try {
      let product = existing
      if (!product) {
        const { data, error } = await supabase
          .from('products')
          .insert({
            household_id: household.id,
            name: name.trim(),
            category_id: categoryId || null,
            default_qty: quantity,
            default_unit: unit,
            default_location_id: locationId,
            shelf_life_days: shelf ? Number(shelf) : null,
            is_quick_add: quickAdd,
            barcode: scanned?.barcode ?? null,
            image_url: scanned?.imageUrl ?? null,
            ingredient_id: index.match(name),
          })
          .select()
          .single()
        if (error) throw error
        product = data
        upsertLocal('products', data)
      } else if (!product.default_location_id && locationId) {
        // První uložení místa si produkt zapamatuje jako výchozí.
        const { data } = await supabase
          .from('products')
          .update({ default_location_id: locationId })
          .eq('id', product.id)
          .select()
          .single()
        if (data) upsertLocal('products', data)
      }
      const id = await actions.add({
        productId: product.id,
        locationId,
        quantity,
        unit,
        expiresOn: labelDate || null,
      })
      onDone(product.name, formatQty(quantity, unit), locationName(locationId), id)
    } catch (e) {
      setError(e instanceof ActionError ? e.message : /duplicate|unique/i.test(errorMessage(e)) ? 'Produkt s tímhle čárovým kódem už existuje.' : errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {scanned?.notice && (
        <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-800/30 dark:text-brand-100">
          {scanned.imageUrl && <img src={scanned.imageUrl} alt="" className="float-right ml-3 h-16 rounded-lg" />}
          {scanned.notice}
        </p>
      )}
      {scanned?.barcode && products.some((p) => !p.barcode && !p.archived) && (
        <SelectField
          label="Nebo je to produkt, který už máš?"
          value=""
          onChange={(e) => void attachBarcode(e.target.value)}
        >
          <option value="">— vyber a kód se mu uloží —</option>
          {products
            .filter((p) => !p.barcode && !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </SelectField>
      )}
      {!existing && (
        <>
          <Field label="Název" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          <SelectField label="Kategorie" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— bez kategorie —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
                {c.default_shelf_life_days != null ? ` (${c.default_shelf_life_days} d)` : ''}
              </option>
            ))}
          </SelectField>
        </>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Množství" inputMode="decimal" required value={qty} onChange={(e) => setQty(e.target.value)} />
        <SelectField label="Jednotka" value={unit} onChange={(e) => setUnit(e.target.value)}>
          {UNITS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </SelectField>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Kam: <span className="font-semibold">{locationName(locationId)}</span>
        </span>
        <LocationPicker value={locationId} onChange={setLocationId} preferZoneType={category?.default_zone_type} />
      </div>

      <Field
        label="Spotřebujte do (z obalu, nepovinné)"
        type="date"
        value={labelDate}
        onChange={(e) => setLabelDate(e.target.value)}
        hint={
          labelDate
            ? undefined
            : estimate
              ? `Bez data odhadnu ${formatDate(estimate, true)} (${effectiveShelf} d).`
              : 'Bez data a bez kategorie zůstane položka bez expirace.'
        }
      />

      {!existing && (
        <>
          <Field
            label="Vlastní trvanlivost ve dnech (nepovinné)"
            inputMode="numeric"
            value={shelf}
            onChange={(e) => setShelf(e.target.value.replace(/\D/g, ''))}
            hint={category ? `Jinak podle kategorie: ${category.default_shelf_life_days ?? '–'} d.` : undefined}
          />
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" className="size-5 accent-brand-700" checked={quickAdd} onChange={(e) => setQuickAdd(e.target.checked)} />
            <span>Rychlé přidání (dlaždice jedním ťuknutím)</span>
          </label>
        </>
      )}

      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
        {busy ? 'Přidávám…' : 'Přidat do skladu'}
      </Button>
    </form>
  )
}
