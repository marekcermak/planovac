import { ArrowRightLeft, CalendarDays, PackageOpen, Trash2, Utensils } from 'lucide-react'
import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Button, ErrorText, Field } from '../components/ui'
import { ActionError, useStockActions } from './actions'
import { daysLeft, expiryLevel, expiryText, formatDate, formatQty, LEVEL_BADGE } from './expiry'
import { LocationPicker } from './LocationPicker'
import { useStock, type StockItem } from './StockProvider'

type Mode = 'main' | 'move' | 'edit'

/** Detail položky skladu s akcemi snědeno / otevřeno / vyhozeno / přesunout / upravit. */
export function ItemSheet({ itemId, onClose }: { itemId: string | null; onClose: () => void }) {
  const { items } = useStock()
  // Vždy aktuální stav (realtime); po snězení / vyhození položka zmizí a panel se zavře.
  const item = (itemId && items.find((i) => i.id === itemId)) || null
  return (
    <Sheet open={item !== null} onClose={onClose} title={item ? <ItemTitle item={item} /> : ''}>
      {item && <ItemBody key={item.id} item={item} onClose={onClose} />}
    </Sheet>
  )
}

function ItemTitle({ item }: { item: StockItem }) {
  const { productById, categoryById } = useStock()
  const product = productById.get(item.product_id)
  const icon = product?.category_id ? categoryById.get(product.category_id)?.icon : undefined
  return (
    <span>
      {icon && <span className="mr-1.5">{icon}</span>}
      {product?.name ?? 'Položka'}
    </span>
  )
}

function ItemBody({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const { locationName, warnDays, productById } = useStock()
  const actions = useStockActions()
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('main')
  const [qty, setQty] = useState(String(item.quantity))
  const [expires, setExpires] = useState(item.expires_on ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const product = productById.get(item.product_id)
  const days = daysLeft(item.expires_on)
  const level = expiryLevel(days, warnDays)
  const name = product?.name ?? 'Položka'

  async function run(fn: () => Promise<void>, message: string, close = true) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      toast(message)
      if (close) onClose()
      else setMode('main')
    } catch (e) {
      setError(e instanceof ActionError ? e.message : 'Něco se pokazilo.')
    } finally {
      setBusy(false)
    }
  }

  const parsedQty = Number(qty.replace(',', '.'))
  const qtyValid = Number.isFinite(parsedQty) && parsedQty > 0
  const partial = qtyValid && parsedQty < item.quantity

  if (mode === 'move') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-500">Kam {name} přesunout? Ťukni na místo.</p>
        <LocationPicker
          value={item.location_id}
          onChange={(loc) => void run(() => actions.move(item.id, loc), `${name} → ${locationName(loc)}`)}
        />
        <ErrorText>{error}</ErrorText>
        <Button variant="ghost" className="w-full" onClick={() => setMode('main')}>
          Zpět
        </Button>
      </div>
    )
  }

  if (mode === 'edit') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void run(
            () =>
              actions.adjust(
                item.id,
                qtyValid && parsedQty !== item.quantity ? parsedQty : undefined,
                expires && expires !== item.expires_on ? expires : undefined,
              ),
            'Uloženo',
            false,
          )
        }}
      >
        <Field
          label={`Množství (${item.unit})`}
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <Field
          label="Spotřebujte do (datum z obalu)"
          type="date"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
        />
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={() => setMode('main')}>
            Zpět
          </Button>
          <Button type="submit" className="flex-1" disabled={busy || !qtyValid}>
            Uložit
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-neutral-500">Množství</dt>
        <dd className="font-medium">{formatQty(item.quantity, item.unit)}</dd>
        <dt className="text-neutral-500">Místo</dt>
        <dd className="font-medium">{locationName(item.location_id)}</dd>
        <dt className="text-neutral-500">Spotřebujte do</dt>
        <dd>
          <span className={`rounded-full px-2 py-0.5 font-medium ${LEVEL_BADGE[level]}`}>
            {formatDate(item.expires_on, true) || 'bez data'}
            {expiryText(days) && ` · ${expiryText(days)}`}
          </span>
          {item.expiry_source === 'estimated' && item.expires_on && (
            <span className="ml-1 text-xs text-neutral-500">(odhad)</span>
          )}
        </dd>
        {item.opened_on && (
          <>
            <dt className="text-neutral-500">Otevřeno</dt>
            <dd className="font-medium">{formatDate(item.opened_on)}</dd>
          </>
        )}
      </dl>

      {item.quantity > 0 && (
        <Field
          label={`Kolik (${item.unit})`}
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          hint={partial ? `Zbude ${formatQty(item.quantity - parsedQty, item.unit)}` : 'Celé množství'}
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          disabled={busy || !qtyValid}
          onClick={() =>
            void run(
              () => actions.take(item.id, 'consume', partial ? parsedQty : undefined),
              partial ? `Snědeno ${formatQty(parsedQty, item.unit)}` : `${name}: snědeno`,
            )
          }
        >
          <Utensils className="size-5" /> Snědeno
        </Button>
        <Button
          variant="secondary"
          className="text-red-700 dark:text-red-400"
          disabled={busy || !qtyValid}
          onClick={() =>
            void run(
              () => actions.take(item.id, 'waste', partial ? parsedQty : undefined),
              partial ? `Vyhozeno ${formatQty(parsedQty, item.unit)}` : `${name}: vyhozeno`,
            )
          }
        >
          <Trash2 className="size-5" /> Vyhozeno
        </Button>
        {!item.opened_on && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void run(() => actions.open(item.id), `${name}: otevřeno`, false)}
          >
            <PackageOpen className="size-5" /> Otevřeno
          </Button>
        )}
        <Button variant="secondary" disabled={busy} onClick={() => setMode('move')}>
          <ArrowRightLeft className="size-5" /> Přesunout
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => setMode('edit')}>
          <CalendarDays className="size-5" /> Upravit
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
