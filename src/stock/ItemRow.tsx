import { daysLeft, expiryLevel, expiryText, formatDate, formatQty, LEVEL_BADGE } from './expiry'
import { useStock, type StockItem } from './StockProvider'
import { DRAG_MIME } from './ZoneMap'
import { FillButton, hasFill } from './FillControl'

/** Řádek položky v seznamu. Na PC jde myší přetáhnout na buňku mapy. */
export function ItemRow({
  item,
  onOpen,
  selected = false,
  showLocation = true,
  draggable = false,
}: {
  item: StockItem
  onOpen: (id: string) => void
  selected?: boolean
  showLocation?: boolean
  draggable?: boolean
}) {
  const { productById, categoryById, locationName, warnDays } = useStock()
  const product = productById.get(item.product_id)
  const category = product?.category_id ? categoryById.get(product.category_id) : undefined
  const days = daysLeft(item.expires_on)
  const level = expiryLevel(days, warnDays)
  const label = expiryText(days) || formatDate(item.expires_on)

  return (
    <div
      className={`flex items-center pr-1 ${selected ? 'bg-brand-50 dark:bg-brand-800/20' : ''}`}
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.setData(DRAG_MIME, item.id)
              e.dataTransfer.effectAllowed = 'move'
            }
          : undefined
      }
    >
      <button
        type="button"
        onClick={() => onOpen(item.id)}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        <span className="text-2xl" aria-hidden>
          {category?.icon ?? '🍽️'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {product?.name ?? '?'}
            {item.opened_on && <span className="ml-1.5 text-xs font-normal text-neutral-500">otevřeno</span>}
          </span>
          <span className="block truncate text-sm text-neutral-500">
            {formatQty(item.quantity, item.unit)}
            {showLocation && ` · ${locationName(item.location_id)}`}
          </span>
        </span>
        {label && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${LEVEL_BADGE[level]}`}>
            {label}
          </span>
        )}
      </button>
      {hasFill(item) && <FillButton item={item} />}
    </div>
  )
}

/** Řazení: nejdřív procházející, bez data na konec. */
export function byExpiry(a: StockItem, b: StockItem): number {
  return (a.expires_on ?? '9999-12-31').localeCompare(b.expires_on ?? '9999-12-31')
}
