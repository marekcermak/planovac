import { ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Button } from '../components/ui'
import { useShopping } from '../shopping/ShoppingProvider'
import { ActionError, useStockActions } from './actions'
import { useStock, type StockItem } from './StockProvider'

const FILL_LABEL = ['prázdná', 'půlka', 'plná'] as const

/** Ikona nádoby: 2 = plná, 1 = půlka, 0 = prázdná. */
export function FillIcon({ level, className = 'size-7' }: { level: number; className?: string }) {
  // Vnitřek nádoby je od y=7 do y=27 (výška 20).
  const h = level >= 2 ? 20 : level === 1 ? 10 : 0
  const tone = level >= 2 ? 'fill-brand-600 dark:fill-brand-500' : level === 1 ? 'fill-amber-500' : 'fill-transparent'
  return (
    <svg viewBox="0 0 24 30" className={className} aria-hidden>
      <rect x="7" y="1.5" width="10" height="3.5" rx="1" className="fill-neutral-400 dark:fill-neutral-500" />
      {h > 0 && <rect x="5" y={27 - h} width="14" height={h} rx="1.5" className={tone} />}
      <rect
        x="4"
        y="6"
        width="16"
        height="22"
        rx="3"
        className={`fill-none stroke-2 ${level === 0 ? 'stroke-red-500' : 'stroke-neutral-500 dark:stroke-neutral-400'}`}
      />
    </svg>
  )
}

/**
 * Ťuknutí přepíná plná → půlka → prázdná → plná.
 * Když je prázdná, nabídne přidání na nákupní seznam (pokud tam ještě není).
 */
export function FillButton({ item, size = 'row' }: { item: StockItem; size?: 'row' | 'large' }) {
  const { productById } = useStock()
  const actions = useStockActions()
  const shopping = useShopping()
  const toast = useToast()
  const [level, setLevel] = useState<number | null>(null) // okamžitá odezva, než DB potvrdí
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const product = productById.get(item.product_id)
  const name = product?.name ?? 'Položka'
  const shown = level ?? item.fill_level
  const onList =
    !!product &&
    shopping.onList({
      productId: product.id,
      ingredientId: product.ingredient_id,
    })

  async function cycle() {
    const next = (shown + 2) % 3 // 2 → 1 → 0 → 2
    setLevel(next)
    try {
      await actions.setFill(item.id, next)
      if (next === 0 && product) {
        if (onList) toast(`${name} je prázdné – už je na nákupním seznamu.`)
        else setAsk(true)
      }
    } catch (e) {
      toast(e instanceof ActionError ? e.message : 'Uložení se nepovedlo.', 'error')
    } finally {
      setLevel(null)
    }
  }

  async function addToList() {
    if (!product) return
    setBusy(true)
    try {
      await shopping.add([
        {
          text: product.name,
          product_id: product.id,
          ingredient_id: product.ingredient_id,
          quantity: product.default_qty,
          unit: product.default_unit,
          source: 'stock',
        },
      ])
      toast(`${name} → nákupní seznam`)
      setAsk(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Přidání se nepovedlo.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          void cycle()
        }}
        aria-label={`Naplnění: ${FILL_LABEL[shown]} – ťukni pro změnu`}
        title={`Naplnění: ${FILL_LABEL[shown]}`}
        className={
          size === 'large'
            ? 'inline-flex min-h-12 items-center gap-2 rounded-xl px-3 font-medium ring-1 ring-neutral-300 active:scale-95 dark:ring-neutral-700'
            : 'flex size-12 shrink-0 items-center justify-center rounded-xl active:scale-90 hover:bg-neutral-100 dark:hover:bg-neutral-800'
        }
      >
        <FillIcon level={shown} />
        {size === 'large' && <span className="capitalize">{FILL_LABEL[shown]}</span>}
      </button>
      <Sheet open={ask} onClose={() => setAsk(false)} title={`${name} je prázdné`}>
        <p className="mb-4 text-neutral-600 dark:text-neutral-400">Přidat na nákupní seznam?</p>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setAsk(false)}>
            Ne
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => void addToList()}>
            <ShoppingCart className="size-5" /> {busy ? 'Přidávám…' : 'Přidat'}
          </Button>
        </div>
      </Sheet>
    </>
  )
}
