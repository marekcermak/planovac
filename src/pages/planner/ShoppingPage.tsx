import { Check, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Sheet } from '../../components/Sheet'
import { useToast } from '../../components/Toast'
import { Button, Card, ErrorText, Field } from '../../components/ui'
import { useKitchen } from '../../kitchen/KitchenProvider'
import { parseShoppingLine, RECIPE_UNITS } from '../../kitchen/parse'
import { useAvailability } from '../../kitchen/availability'
import { useHousehold } from '../../household/HouseholdProvider'
import { formatQty } from '../../stock/expiry'
import { useShopping, type ShoppingItem } from '../../shopping/ShoppingProvider'

const qtyFmt = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 })

export function ShoppingPage() {
  const { open, done, loading, error, add, clearDone } = useShopping()
  const { index, ingredientById } = useKitchen()
  const toast = useToast()
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<ShoppingItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const p = parseShoppingLine(text)
    if (!p) return
    setBusy(true)
    setFormError(null)
    try {
      const ingredientId = index.match(p.name)
      // Text, jak ho uživatel napsal (bez množství); když je v 2. pádě („2 l mléka“), radši název suroviny.
      const typedFirst = !/^\d/.test(text.trim())
      const name = typedFirst || !ingredientId ? p.name : (ingredientById.get(ingredientId)?.name ?? p.name)
      const created = await add([{ text: name, ingredient_id: ingredientId, quantity: p.quantity, unit: p.unit, source: 'manual' }])
      if (created === 0) toast(`${name}: už na seznamu bylo, sloučeno`)
      setText('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Nepodařilo se přidat.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void submit(e)} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Přidat… (např. mléko 2 l)"
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
          <p className="text-neutral-500">
            Seznam je prázdný. Přidávej sem ručně, z receptu („Chybějící do nákupu“) nebo ze skladu („Dokoupit“).
          </p>
        </Card>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
          {open.map((it) => (
            <Row key={it.id} item={it} onEdit={() => setEditing(it)} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-neutral-500">V košíku ({done.length})</h2>
            <Button
              variant="ghost"
              className="min-h-10 text-sm"
              onClick={() => void clearDone().catch((e: Error) => setFormError(e.message))}
            >
              <Trash2 className="size-4" /> Smazat koupené
            </Button>
          </div>
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white opacity-70 ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
            {done.map((it) => (
              <Row key={it.id} item={it} onEdit={() => setEditing(it)} />
            ))}
          </ul>
        </section>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.text ?? ''}>
        {editing && <EditForm key={editing.id} item={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  )
}

function Row({ item, onEdit }: { item: ShoppingItem; onEdit: () => void }) {
  const { toggle } = useShopping()
  const { members } = useHousehold()
  const availability = useAvailability()
  const toast = useToast()
  const stock = item.ingredient_id && !item.checked ? availability.stockFor(item.ingredient_id) : []
  const adder = members.length > 1 ? members.find((m) => m.user_id === item.added_by) : undefined
  const details = [
    item.quantity != null ? `${qtyFmt.format(item.quantity)} ${item.unit ?? ''}`.trim() : null,
    item.note,
    item.recipe_titles.length ? `na ${item.recipe_titles.join(', ')}` : null,
  ].filter(Boolean)

  return (
    <li className="flex min-h-14 items-center">
      <button
        aria-label={item.checked ? `Vrátit ${item.text}` : `Koupeno: ${item.text}`}
        onClick={() => void toggle(item).catch((e: Error) => toast(e.message, 'error'))}
        className="flex size-14 shrink-0 items-center justify-center"
      >
        <span
          className={`flex size-7 items-center justify-center rounded-full ring-2 ${
            item.checked ? 'bg-brand-700 text-white ring-brand-700' : 'ring-neutral-300 dark:ring-neutral-600'
          }`}
        >
          {item.checked && <Check className="size-4" />}
        </span>
      </button>
      <button onClick={onEdit} className="min-w-0 flex-1 py-2 pr-3 text-left">
        <span className={`block font-medium ${item.checked ? 'line-through' : ''}`}>{item.text}</span>
        {(details.length > 0 || stock.length > 0 || adder) && (
          <span className="block text-sm text-neutral-500">
            {details.join(' · ')}
            {stock.length > 0 && (
              <span className="text-orange-700 dark:text-orange-400">
                {details.length ? ' · ' : ''}doma {stock.map((s) => formatQty(s.quantity, s.unit)).join(' + ')}
              </span>
            )}
            {adder && <span> · {adder.display_name}</span>}
          </span>
        )}
      </button>
    </li>
  )
}

function EditForm({ item, onDone }: { item: ShoppingItem; onDone: () => void }) {
  const { update, remove } = useShopping()
  const [text, setText] = useState(item.text)
  const [qty, setQty] = useState(item.quantity != null ? String(item.quantity).replace('.', ',') : '')
  const [unit, setUnit] = useState(item.unit ?? '')
  const [note, setNote] = useState(item.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se uložit.')
    } finally {
      setBusy(false)
    }
  }

  const n = Number(qty.replace(',', '.'))
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void run(() =>
          update(item.id, {
            text: text.trim(),
            quantity: qty.trim() && n > 0 ? n : null,
            unit: unit.trim() || null,
            note: note.trim() || null,
          }),
        )
      }}
    >
      <Field label="Co" required maxLength={120} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Množství" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        <Field label="Jednotka" list="shopping-units" maxLength={20} value={unit} onChange={(e) => setUnit(e.target.value)} />
        <datalist id="shopping-units">
          {RECIPE_UNITS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </div>
      <Field label="Poznámka" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      {item.recipe_titles.length > 0 && <p className="text-sm text-neutral-500">Pro recepty: {item.recipe_titles.join(', ')}</p>}
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={busy || !text.trim()}>
          Uložit
        </Button>
        <Button type="button" variant="danger" disabled={busy} onClick={() => void run(() => remove(item.id))}>
          <Trash2 className="size-5" /> Smazat
        </Button>
      </div>
    </form>
  )
}
