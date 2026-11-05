import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Sheet } from '../../components/Sheet'
import { useToast } from '../../components/Toast'
import { Button, ErrorText, Field, PageHeader, SelectField } from '../../components/ui'
import { useHousehold } from '../../household/HouseholdProvider'
import { errorMessage, supabase } from '../../lib/supabase'
import { useStock, type Category } from '../../stock/StockProvider'
import { BackLink, ZONE_TYPES } from './ZonesPage'

function days(n: number | null) {
  return n == null ? '–' : `${n} d`
}

export function CategoriesPage() {
  const { categories } = useStock()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  return (
    <div className="max-w-2xl">
      <BackLink to="/vice/nastaveni" label="Nastavení" />
      <PageHeader title="Kategorie" subtitle="Výchozí trvanlivost se použije, když produkt nemá vlastní." />
      <div className="mb-4 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
        <div className="grid grid-cols-[1fr_4.5rem_4.5rem] gap-2 border-b border-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-500 dark:border-neutral-800">
          <span>Kategorie</span>
          <span className="text-right">Trvanlivost</span>
          <span className="text-right">Po otevření</span>
        </div>
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {categories.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setEditing(c)}
                className="grid min-h-12 w-full grid-cols-[1fr_4.5rem_4.5rem] items-center gap-2 px-4 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <span className="truncate">
                  <span className="mr-2">{c.icon}</span>
                  {c.name}
                </span>
                <span className="text-right tabular-nums">{days(c.default_shelf_life_days)}</span>
                <span className="text-right text-neutral-500 tabular-nums">{days(c.opened_shelf_life_days)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <Button variant="secondary" onClick={() => setEditing('new')}>
        <Plus className="size-5" /> Nová kategorie
      </Button>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nová kategorie' : (editing?.name ?? '')}
      >
        {editing && (
          <CategoryForm
            key={editing === 'new' ? 'new' : editing.id}
            category={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  )
}

function CategoryForm({ category, onDone }: { category: Category | null; onDone: () => void }) {
  const { household } = useHousehold()
  const { categories, upsertLocal, removeLocal } = useStock()
  const toast = useToast()
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? '🍽️')
  const [shelf, setShelf] = useState(category?.default_shelf_life_days?.toString() ?? '')
  const [opened, setOpened] = useState(category?.opened_shelf_life_days?.toString() ?? '')
  const [zoneType, setZoneType] = useState(category?.default_zone_type ?? 'fridge')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!household) return
    setBusy(true)
    setError(null)
    const row = {
      name: name.trim(),
      icon: icon.trim() || '🍽️',
      default_shelf_life_days: shelf === '' ? null : Number(shelf),
      opened_shelf_life_days: opened === '' ? null : Number(opened),
      default_zone_type: zoneType,
    }
    const res = category
      ? await supabase.from('categories').update(row).eq('id', category.id).select().single()
      : await supabase
          .from('categories')
          .insert({ ...row, household_id: household.id, sort: (categories.at(-1)?.sort ?? 0) + 1 })
          .select()
          .single()
    setBusy(false)
    if (res.error) {
      return setError(/unique|duplicate/i.test(res.error.message) ? 'Kategorie s tímhle názvem už existuje.' : errorMessage(res.error))
    }
    upsertLocal('categories', res.data)
    onDone()
  }

  async function remove() {
    if (!category) return
    const { error } = await supabase.from('categories').delete().eq('id', category.id)
    if (error) return setError(errorMessage(error))
    removeLocal('categories', category.id)
    toast(`Kategorie ${category.name} smazána`)
    onDone()
  }

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4)

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <Field label="Ikona" maxLength={8} value={icon} onChange={(e) => setIcon(e.target.value)} />
        <Field label="Název" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Trvanlivost (dny)" inputMode="numeric" value={shelf} onChange={(e) => setShelf(digits(e.target.value))} />
        <Field
          label="Po otevření (dny)"
          inputMode="numeric"
          value={opened}
          onChange={(e) => setOpened(digits(e.target.value))}
          hint="Prázdné = otevření expiraci nemění."
        />
      </div>
      <SelectField label="Kam to obvykle patří" value={zoneType} onChange={(e) => setZoneType(e.target.value)}>
        {Object.entries(ZONE_TYPES).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </SelectField>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={busy || !name.trim()}>
          Uložit
        </Button>
        {category && (
          <Button type="button" variant="danger" onClick={() => void remove()} aria-label="Smazat kategorii">
            <Trash2 className="size-5" />
          </Button>
        )}
      </div>
    </form>
  )
}
