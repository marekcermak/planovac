import { Search, Zap } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Sheet } from '../../components/Sheet'
import { Button, Chip, ErrorText, Field, PageHeader, SelectField } from '../../components/ui'
import { errorMessage, supabase } from '../../lib/supabase'
import { fold } from '../../lib/text'
import { formatQty, UNITS } from '../../stock/expiry'
import { LocationPicker } from '../../stock/LocationPicker'
import { useStock, type Product } from '../../stock/StockProvider'
import { BackLink } from './ZonesPage'

export function ProductsPage() {
  const { products, categoryById, locationName } = useStock()
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const q = fold(query)
  const list = products.filter((p) => p.archived === showArchived && (!q || fold(p.name).includes(q)))

  return (
    <div className="max-w-2xl">
      <BackLink to="/vice/nastaveni" label="Nastavení" />
      <PageHeader title="Produkty" subtitle="Nové produkty zakládáš při přidávání do skladu." />
      <div className="mb-3 flex gap-2">
        <label className="relative block flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            placeholder="Hledat"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="block min-h-12 w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-10 text-base outline-none focus:border-brand-600 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <Chip active={showArchived} onClick={() => setShowArchived((v) => !v)} className="min-h-12">
          Archiv
        </Chip>
      </div>
      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
        {list.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => setEditing(p)}
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
              {p.is_quick_add && <Zap className="size-4 text-brand-700" aria-label="Rychlé přidání" />}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="px-4 py-6 text-center text-neutral-500">Žádné produkty.</li>}
      </ul>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.name ?? ''}>
        {editing && <ProductForm key={editing.id} product={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  )
}

function ProductForm({ product, onDone }: { product: Product; onDone: () => void }) {
  const { categories, upsertLocal } = useStock()
  const [name, setName] = useState(product.name)
  const [categoryId, setCategoryId] = useState(product.category_id ?? '')
  const [qty, setQty] = useState(String(product.default_qty))
  const [unit, setUnit] = useState(product.default_unit)
  const [shelf, setShelf] = useState(product.shelf_life_days?.toString() ?? '')
  const [opened, setOpened] = useState(product.opened_shelf_life_days?.toString() ?? '')
  const [locationId, setLocationId] = useState(product.default_location_id)
  const [quick, setQuick] = useState(product.is_quick_add)
  const [price, setPrice] = useState(product.price?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4)
  const category = categories.find((c) => c.id === categoryId)

  async function save(patch?: Partial<Product>) {
    setBusy(true)
    setError(null)
    const quantity = Number(qty.replace(',', '.'))
    const { data, error } = await supabase
      .from('products')
      .update(
        patch ?? {
          name: name.trim(),
          category_id: categoryId || null,
          default_qty: quantity > 0 ? quantity : 1,
          default_unit: unit,
          shelf_life_days: shelf === '' ? null : Number(shelf),
          opened_shelf_life_days: opened === '' ? null : Number(opened),
          default_location_id: locationId,
          is_quick_add: quick,
          price: price === '' ? null : Number(price.replace(',', '.')),
        },
      )
      .eq('id', product.id)
      .select()
      .single()
    setBusy(false)
    if (error) return setError(errorMessage(error))
    upsertLocal('products', data)
    onDone()
  }

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        void save()
      }}
      className="space-y-4"
    >
      <Field label="Název" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <SelectField label="Kategorie" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">— bez kategorie —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.icon} {c.name}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Výchozí množství" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        <SelectField label="Jednotka" value={unit} onChange={(e) => setUnit(e.target.value)}>
          {UNITS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </SelectField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Trvanlivost (dny)"
          inputMode="numeric"
          value={shelf}
          placeholder={category?.default_shelf_life_days?.toString() ?? ''}
          onChange={(e) => setShelf(digits(e.target.value))}
        />
        <Field
          label="Po otevření (dny)"
          inputMode="numeric"
          value={opened}
          placeholder={category?.opened_shelf_life_days?.toString() ?? ''}
          onChange={(e) => setOpened(digits(e.target.value))}
        />
      </div>
      <p className="-mt-2 text-sm text-neutral-500">Prázdné = podle kategorie.</p>
      <Field label="Cena v Kč (nepovinné, pro statistiku vyhozeného)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Výchozí místo</span>
        <LocationPicker value={locationId} onChange={setLocationId} preferZoneType={category?.default_zone_type} />
      </div>
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" className="size-5 accent-brand-700" checked={quick} onChange={(e) => setQuick(e.target.checked)} />
        <span>Rychlé přidání</span>
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={busy || !name.trim()}>
          Uložit
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void save({ archived: !product.archived })}>
          {product.archived ? 'Obnovit' : 'Archivovat'}
        </Button>
      </div>
    </form>
  )
}
