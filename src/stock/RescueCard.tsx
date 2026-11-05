import { ArrowRightLeft, PackageOpen, Trash2, Utensils } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useToast } from '../components/Toast'
import { Card } from '../components/ui'
import { ActionError, useStockActions } from './actions'
import { daysLeft, expiryLevel } from './expiry'
import { byExpiry, ItemRow } from './ItemRow'
import { ItemSheet } from './ItemSheet'
import { useStock, type StockItem } from './StockProvider'

/** „Zachraň dnes“: položky s expirací ≤ expiry_warn_days, nejdřív procházející, s rychlými akcemi. */
export function RescueCard() {
  const { items, warnDays, productById, loading } = useStock()
  const actions = useStockActions()
  const toast = useToast()
  const [openItem, setOpenItem] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const rescue = items
    .filter((i) => {
      const lvl = expiryLevel(daysLeft(i.expires_on), warnDays)
      return lvl === 'expired' || lvl === 'soon'
    })
    .sort(byExpiry)

  async function act(item: StockItem, fn: () => Promise<void>, verb: string) {
    setBusy(item.id)
    try {
      await fn()
      toast(`${productById.get(item.product_id)?.name ?? 'Položka'}: ${verb}`)
    } catch (e) {
      toast(e instanceof ActionError ? e.message : 'Nepovedlo se.', 'error')
    } finally {
      setBusy(null)
    }
  }

  const iconBtn =
    'flex size-11 items-center justify-center rounded-full text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:ring-neutral-700 dark:hover:bg-neutral-800'

  return (
    <Card title={rescue.length > 0 ? `Zachraň dnes (${rescue.length})` : 'Zachraň dnes'}>
      {loading ? (
        <p className="text-neutral-500">Načítám…</p>
      ) : rescue.length === 0 ? (
        <p className="text-neutral-500">
          Nic neprochází. 🎉{' '}
          {items.length === 0 && (
            <Link to="/pridat" className="font-medium text-brand-700 dark:text-brand-500">
              Přidat potraviny →
            </Link>
          )}
        </p>
      ) : (
        <ul className="-mx-4 divide-y divide-neutral-100 dark:divide-neutral-800">
          {rescue.map((i) => (
            <li key={i.id} className="pr-3">
              <div className="flex items-center">
                <div className="min-w-0 flex-1">
                  <ItemRow item={i} onOpen={setOpenItem} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pb-2 pl-14">
                <button
                  aria-label="Snědeno"
                  title="Snědeno"
                  disabled={busy === i.id}
                  className={iconBtn}
                  onClick={() => void act(i, () => actions.take(i.id, 'consume'), 'snědeno')}
                >
                  <Utensils className="size-5" />
                </button>
                {!i.opened_on && (
                  <button
                    aria-label="Otevřeno"
                    title="Otevřeno"
                    disabled={busy === i.id}
                    className={iconBtn}
                    onClick={() => void act(i, () => actions.open(i.id), 'otevřeno')}
                  >
                    <PackageOpen className="size-5" />
                  </button>
                )}
                <button
                  aria-label="Vyhozeno"
                  title="Vyhozeno"
                  disabled={busy === i.id}
                  className={`${iconBtn} text-red-700 dark:text-red-400`}
                  onClick={() => void act(i, () => actions.take(i.id, 'waste'), 'vyhozeno')}
                >
                  <Trash2 className="size-5" />
                </button>
                <button aria-label="Přesunout" title="Přesunout" className={iconBtn} onClick={() => setOpenItem(i.id)}>
                  <ArrowRightLeft className="size-5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ItemSheet itemId={openItem} onClose={() => setOpenItem(null)} />
    </Card>
  )
}
