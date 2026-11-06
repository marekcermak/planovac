import { Camera, ChevronLeft, ImagePlus, MapPin, Receipt, ShoppingCart } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Button, Card, ErrorText, PageHeader } from '../components/ui'
import { useHousehold } from '../household/HouseholdProvider'
import { useKitchen } from '../kitchen/KitchenProvider'
import { convertQty } from '../kitchen/units'
import { callAi, useAi } from '../lib/AiProvider'
import { blobToBase64, shrinkImage } from '../lib/images'
import { errorMessage, supabase } from '../lib/supabase'
import { fold } from '../lib/text'
import { useShopping, type ShoppingItem } from '../shopping/ShoppingProvider'
import { useStockActions } from '../stock/actions'
import { UNITS } from '../stock/expiry'
import { LocationPicker } from '../stock/LocationPicker'
import { useStock, type Product } from '../stock/StockProvider'

type Row = {
  key: string
  include: boolean
  name: string
  raw?: string
  productId: string | null
  categoryId: string
  quantity: string
  unit: string
  locationId: string | null
  price: number | null
  /** Z jaké položky nákupního seznamu řádek vznikl (po naskladnění se smaže). */
  shoppingId?: string
}

type ReceiptItem = {
  raw: string
  name: string
  quantity: number
  unit: string
  price: number | null
  is_food: boolean
  product_id: string | null
  category: string | null
}

const num = (s: string) => Number(s.replace(',', '.'))
const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',')

/**
 * „Vybaluju nákup“ (SPEC kap. 4/7, fáze 4c): položky z účtenky (AI) nebo z odškrtnutého nákupního seznamu
 * → kontrola (produkt, množství, místo) → naskladnění najednou. Koupené zmizí z nákupního seznamu.
 */
export function UnpackPage() {
  const [params] = useSearchParams()
  const { products, productById, categories, categoryById, zones, locations, locationName } = useStock()
  const { household } = useHousehold()
  const { index } = useKitchen()
  const shopping = useShopping()
  const { available: aiOn, refresh } = useAi()
  const actions = useStockActions()
  const { upsertLocal } = useStock()
  const toast = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [shop, setShop] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [locFor, setLocFor] = useState<string | null>(null)

  const productByName = useMemo(() => new Map(products.filter((p) => !p.archived).map((p) => [fold(p.name), p])), [products])
  const productByIngredient = useMemo(() => {
    const m = new Map<string, Product>()
    for (const p of products) if (p.ingredient_id && !p.archived && !m.has(p.ingredient_id)) m.set(p.ingredient_id, p)
    return m
  }, [products])

  /** Výchozí místo: produktu, jinak první buňka zóny podle kategorie. */
  function defaultLocation(product: Product | undefined, categoryId: string): string | null {
    if (product?.default_location_id) return product.default_location_id
    const type = categoryById.get(categoryId)?.default_zone_type
    const zone = zones.find((z) => z.type === type) ?? zones[0]
    return locations.find((l) => l.zone_id === zone?.id)?.id ?? null
  }

  function rowFor(init: {
    name: string
    raw?: string
    product?: Product
    categoryId?: string | null
    quantity: number
    unit: string
    price?: number | null
    include?: boolean
    shoppingId?: string
  }): Row {
    const p = init.product
    let quantity = init.quantity
    let unit = init.unit
    // „2 ks Mléko 1 l“ u produktu vedeného v litrech → 2 × výchozí množství.
    // „0,5 kg“ u produktu v gramech → 500 g.
    if (p && unit !== p.default_unit) {
      const converted = unit === 'ks' || unit === 'bal' ? null : convertQty(quantity, unit, p.default_unit)
      quantity = converted ?? (unit === 'ks' || unit === 'bal' ? quantity * p.default_qty : p.default_qty)
      unit = p.default_unit
    }
    const categoryId = p?.category_id ?? init.categoryId ?? ''
    return {
      key: crypto.randomUUID(),
      include: init.include ?? true,
      name: p?.name ?? init.name,
      raw: init.raw,
      productId: p?.id ?? null,
      categoryId,
      quantity: fmt(quantity),
      unit,
      locationId: defaultLocation(p, categoryId),
      price: init.price ?? null,
      shoppingId: init.shoppingId,
    }
  }

  function fromShopping(items: ShoppingItem[]) {
    setShop(null)
    setRows(
      items.map((it) => {
        const p =
          (it.product_id && productById.get(it.product_id)) ||
          (it.ingredient_id && productByIngredient.get(it.ingredient_id)) ||
          productByName.get(fold(it.text)) ||
          undefined
        return rowFor({
          name: it.text,
          product: p,
          quantity: it.quantity ?? p?.default_qty ?? 1,
          unit: it.unit && (UNITS as readonly string[]).includes(it.unit) ? it.unit : (p?.default_unit ?? 'ks'),
          shoppingId: it.id,
        })
      }),
    )
  }

  async function fromReceipt(files: File[]) {
    setBusy('Čtu účtenku… (chvilku to trvá)')
    setError(null)
    try {
      const images = await Promise.all(
        files.slice(0, 4).map(async (f) => ({ media_type: 'image/jpeg', data: await blobToBase64(await shrinkImage(f, 2000, 0.85)) })),
      )
      const r = await callAi<{ shop: string | null; items: ReceiptItem[] }>('receipt_photo', { images }, refresh)
      setShop(r.shop)
      setRows(
        r.items.map((i) => {
          const p = (i.product_id && productById.get(i.product_id)) || productByName.get(fold(i.name)) || undefined
          return rowFor({
            name: i.name,
            raw: i.raw,
            product: p,
            categoryId: categories.find((c) => c.name === i.category)?.id ?? null,
            quantity: i.quantity,
            unit: i.unit,
            price: i.price,
            include: i.is_food,
          })
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Účtenku se nepodařilo přečíst.')
    } finally {
      setBusy(null)
    }
  }

  // Ze seznamu rovnou (odkaz „Vybalit koupené“) – jednou, až jsou data načtená.
  const autoLoaded = useRef(false)
  const doneItems = shopping.done
  useEffect(() => {
    if (autoLoaded.current || params.get('z') !== 'nakup' || shopping.loading || doneItems.length === 0) return
    autoLoaded.current = true
    fromShopping(doneItems)
    // fromShopping záměrně mimo závislosti – spouští se jen jednou
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, shopping.loading, doneItems])

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null)

  async function submit() {
    if (!rows || !household) return
    const chosen = rows.filter((r) => r.include)
    const invalid = chosen.find((r) => !r.name.trim() || !(num(r.quantity) > 0))
    if (invalid) return setError(`Zkontroluj množství u „${invalid.name || 'položky bez názvu'}“.`)
    setBusy('Naskladňuji…')
    setError(null)
    const added: Product[] = []
    try {
      for (const r of chosen) {
        const quantity = num(r.quantity)
        const unitPrice = r.price != null && quantity > 0 ? Math.round((r.price / (r.unit === 'ks' || r.unit === 'bal' ? quantity : 1)) * 100) / 100 : null
        let product = r.productId ? productById.get(r.productId) : undefined
        if (!product) {
          const { data, error } = await supabase
            .from('products')
            .insert({
              household_id: household.id,
              name: r.name.trim(),
              category_id: r.categoryId || null,
              default_qty: quantity,
              default_unit: r.unit,
              default_location_id: r.locationId,
              ingredient_id: index.match(r.name),
              price: unitPrice,
            })
            .select()
            .single()
          if (error) throw new Error(`${r.name}: ${errorMessage(error)}`)
          upsertLocal('products', data)
          product = data
        } else if (unitPrice != null && unitPrice !== product.price) {
          const { data } = await supabase.from('products').update({ price: unitPrice }).eq('id', product.id).select().single()
          if (data) upsertLocal('products', data)
        }
        await actions.add({ productId: product.id, locationId: r.locationId, quantity, unit: r.unit })
        added.push(product)
      }

      // Koupené zmizí z nákupního seznamu: řádky ze seznamu + neodškrtnuté položky se stejným produktem / surovinou.
      const done = new Set(chosen.map((r) => r.shoppingId).filter((x): x is string => !!x))
      for (const it of shopping.items) {
        if (done.has(it.id)) continue
        if (added.some((p) => (it.product_id && it.product_id === p.id) || (it.ingredient_id && it.ingredient_id === p.ingredient_id))) done.add(it.id)
      }
      await Promise.all([...done].map((id) => shopping.remove(id).catch(() => undefined)))

      toast(`Naskladněno: ${added.length}${done.size ? ` · z nákupního seznamu odebráno ${done.size}` : ''}`)
      navigate('/sklad')
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : 'Něco se pokazilo.'}${added.length ? ` (už naskladněno ${added.length} – ty z formuláře odeber, ať nejsou dvakrát)` : ''}`,
      )
      // Hotové řádky z formuláře vyřadit, aby se při opakování nepřidaly znovu.
      const doneKeys = new Set(chosen.slice(0, added.length).map((r) => r.key))
      setRows((rs) => rs?.filter((r) => !doneKeys.has(r.key)) ?? null)
    } finally {
      setBusy(null)
    }
  }

  const included = rows?.filter((r) => r.include).length ?? 0
  const locRow = rows?.find((r) => r.key === locFor)

  return (
    <div className="max-w-3xl pb-6">
      <Link to="/pridat" className="mb-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-neutral-500">
        <ChevronLeft className="size-4" /> Přidat
      </Link>
      <PageHeader title="Vybalit nákup" subtitle={shop ? `Účtenka: ${shop}` : 'Z účtenky nebo z odškrtnutého nákupního seznamu.'} />

      {rows === null && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title={<span className="flex items-center gap-2"><Receipt className="size-5" /> Účtenka</span>}>
            {aiOn ? (
              <>
                <p className="mb-3 text-sm text-neutral-500">Vyfoť celou účtenku (dlouhou klidně na víc fotek). AI přečte položky, ty je zkontroluješ.</p>
                <div className="flex flex-wrap gap-2">
                  <FileButton capture onFiles={(f) => void fromReceipt(f)} disabled={!!busy}>
                    <Camera className="size-5" /> Vyfotit
                  </FileButton>
                  <FileButton onFiles={(f) => void fromReceipt(f)} disabled={!!busy}>
                    <ImagePlus className="size-5" /> Z galerie
                  </FileButton>
                </div>
              </>
            ) : (
              <p className="text-sm text-neutral-500">
                Čtení účtenky potřebuje AI – zapneš ji v <Link to="/vice/nastaveni/ai" className="text-brand-700 underline dark:text-brand-500">Nastavení → AI funkce</Link>.
              </p>
            )}
          </Card>
          <Card title={<span className="flex items-center gap-2"><ShoppingCart className="size-5" /> Nákupní seznam</span>}>
            {shopping.done.length > 0 ? (
              <>
                <p className="mb-3 text-sm text-neutral-500">V košíku je {shopping.done.length} odškrtnutých položek.</p>
                <Button onClick={() => fromShopping(shopping.done)}>Vybalit koupené ({shopping.done.length})</Button>
              </>
            ) : (
              <p className="text-sm text-neutral-500">Na nákupním seznamu zatím nic odškrtnutého.</p>
            )}
          </Card>
        </div>
      )}

      {busy && <p className="my-4 animate-pulse font-medium text-brand-700 dark:text-brand-500">{busy}</p>}
      <ErrorText>{error}</ErrorText>

      {rows && (
        <>
          {rows.length === 0 ? (
            <Card>
              <p className="text-neutral-500">Žádné položky.</p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => {
                const product = r.productId ? productById.get(r.productId) : undefined
                return (
                  <li
                    key={r.key}
                    className={`rounded-2xl bg-white p-3 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800 ${r.include ? '' : 'opacity-50'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Naskladnit ${r.name}`}
                        className="mt-3 size-5 shrink-0 accent-brand-700"
                        checked={r.include}
                        onChange={(e) => update(r.key, { include: e.target.checked })}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div>
                          <input
                            value={r.name}
                            onChange={(e) => update(r.key, { name: e.target.value })}
                            maxLength={80}
                            aria-label="Název"
                            disabled={!!product}
                            className="block min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 font-medium disabled:border-transparent disabled:bg-transparent disabled:px-0 dark:border-neutral-700 dark:bg-neutral-900"
                          />
                          {r.raw && <span className="block text-xs text-neutral-400">{r.raw}{r.price != null && ` · ${fmt(r.price)} Kč`}</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            aria-label="Produkt"
                            value={r.productId ?? ''}
                            onChange={(e) => {
                              const p = e.target.value ? productById.get(e.target.value) : undefined
                              update(r.key, p
                                ? { productId: p.id, name: p.name, unit: p.default_unit, categoryId: p.category_id ?? '', locationId: defaultLocation(p, p.category_id ?? '') }
                                : { productId: null })
                            }}
                            className="min-h-10 max-w-full min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                          >
                            <option value="">＋ nový produkt</option>
                            {products.filter((p) => !p.archived).map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          {!product && (
                            <select
                              aria-label="Kategorie"
                              value={r.categoryId}
                              onChange={(e) => update(r.key, { categoryId: e.target.value, locationId: r.locationId ?? defaultLocation(undefined, e.target.value) })}
                              className="min-h-10 rounded-xl border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                            >
                              <option value="">kategorie…</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            inputMode="decimal"
                            aria-label="Množství"
                            value={r.quantity}
                            onChange={(e) => update(r.key, { quantity: e.target.value })}
                            className="min-h-10 w-20 rounded-xl border border-neutral-300 bg-white px-2 text-right dark:border-neutral-700 dark:bg-neutral-900"
                          />
                          <select
                            aria-label="Jednotka"
                            value={r.unit}
                            onChange={(e) => update(r.key, { unit: e.target.value })}
                            className="min-h-10 rounded-xl border border-neutral-300 bg-white px-2 dark:border-neutral-700 dark:bg-neutral-900"
                          >
                            {UNITS.map((u) => (
                              <option key={u}>{u}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setLocFor(r.key)}
                            className="inline-flex min-h-10 min-w-0 items-center gap-1 rounded-xl px-2 text-sm text-neutral-600 ring-1 ring-neutral-300 dark:text-neutral-400 dark:ring-neutral-700"
                          >
                            <MapPin className="size-4 shrink-0" />
                            <span className="truncate">{r.locationId ? locationName(r.locationId) : 'místo…'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] mt-4 flex gap-2 rounded-2xl bg-white/90 p-2 backdrop-blur lg:bottom-4 dark:bg-neutral-950/90">
            <Button variant="ghost" onClick={() => setRows(null)} disabled={!!busy}>
              Zpět
            </Button>
            <Button className="flex-1" onClick={() => void submit()} disabled={!!busy || included === 0}>
              Naskladnit ({included})
            </Button>
          </div>
          <p className="mt-2 text-sm text-neutral-500">Expirace se dopočítá podle produktu / kategorie, upravíš ji pak u položky ve skladu.</p>
        </>
      )}

      <Sheet open={!!locRow} onClose={() => setLocFor(null)} title={locRow ? `Kam: ${locRow.name}` : ''}>
        {locRow && (
          <LocationPicker
            value={locRow.locationId}
            preferZoneType={categoryById.get(locRow.categoryId)?.default_zone_type}
            onChange={(id) => {
              update(locRow.key, { locationId: id })
              setLocFor(null)
            }}
          />
        )}
      </Sheet>
    </div>
  )
}

function FileButton({ capture, onFiles, disabled, children }: { capture?: boolean; onFiles: (f: File[]) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label className={`inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-4 font-medium ${capture ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-neutral-300 dark:bg-neutral-800 dark:ring-neutral-700'} ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      {children}
      <input
        type="file"
        accept="image/*"
        multiple={!capture}
        {...(capture ? { capture: 'environment' as const } : {})}
        className="sr-only"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
    </label>
  )
}
