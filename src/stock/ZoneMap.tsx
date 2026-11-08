import { Check } from 'lucide-react'
import { useState } from 'react'
import { daysLeft, expiryLevel, LEVEL_CELL, worstLevel } from './expiry'
import { useStock, type StockItem, type Zone } from './StockProvider'

export const DRAG_MIME = 'application/x-stock-item'

/**
 * Mřížka zóny: každé místo je obdélník buněk, barva podle nejdřív procházející položky.
 * - `onSelect` – klik na místo (filtr seznamu / výběr místa),
 * - `highlight` – místa zvýrazněná hledáním „kde je…“,
 * - `onDropItem` – přetažení položky ze seznamu myší (PC).
 */
export function ZoneMap({
  zone,
  items,
  selectedId,
  highlight,
  onSelect,
  onDropItem,
  compact = false,
}: {
  zone: Zone
  items: StockItem[]
  selectedId?: string | null
  highlight?: Set<string>
  onSelect?: (locationId: string) => void
  onDropItem?: (itemId: string, locationId: string) => void
  compact?: boolean
}) {
  const { locations, productById, warnDays } = useStock()
  const [dragOver, setDragOver] = useState<string | null>(null)
  const zoneLocations = locations.filter((l) => l.zone_id === zone.id)

  return (
    <div
      className="grid gap-1.5 rounded-2xl bg-neutral-200/60 p-1.5 dark:bg-neutral-800/60"
      style={{
        gridTemplateColumns: `repeat(${zone.grid_cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${zone.grid_rows}, minmax(${compact ? '2.75rem' : '4.25rem'}, auto))`,
      }}
    >
      {zoneLocations.map((loc) => {
        const here = items.filter((i) => i.location_id === loc.id)
        const level = worstLevel(here.map((i) => expiryLevel(daysLeft(i.expires_on), warnDays)))
        const names = here
          .slice()
          .sort((a, b) => (a.expires_on ?? '9999').localeCompare(b.expires_on ?? '9999'))
          .map((i) => productById.get(i.product_id)?.name ?? '?')
        const selected = selectedId === loc.id
        const lit = highlight?.has(loc.id)
        return (
          <button
            key={loc.id}
            type="button"
            onClick={() => onSelect?.(loc.id)}
            onDragOver={
              onDropItem
                ? (e) => {
                    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
                    e.preventDefault()
                    setDragOver(loc.id)
                  }
                : undefined
            }
            onDragLeave={onDropItem ? () => setDragOver((d) => (d === loc.id ? null : d)) : undefined}
            onDrop={
              onDropItem
                ? (e) => {
                    const id = e.dataTransfer.getData(DRAG_MIME)
                    setDragOver(null)
                    if (id) onDropItem(id, loc.id)
                  }
                : undefined
            }
            style={{
              gridRow: `${loc.row + 1} / span ${loc.row_span}`,
              gridColumn: `${loc.col + 1} / span ${loc.col_span}`,
            }}
            aria-pressed={onSelect ? selected : undefined}
            className={`flex min-w-0 flex-col items-start overflow-hidden rounded-xl p-2 text-left ring-1 transition ${
              selected
                ? // Vybrané místo plnou barvou – jinak splývalo s obsazenými (zelenými) buňkami, v tmavém režimu úplně.
                  'bg-brand-700 ring-[3px] ring-brand-700 dark:bg-brand-600 dark:ring-white'
                : dragOver === loc.id
                  ? `${LEVEL_CELL[level ?? 'none']} ring-[3px] ring-brand-600! dark:ring-brand-500!`
                  : // Ve výběru místa (compact) bez barev expirace – svítit má jen vybraná buňka.
                    LEVEL_CELL[compact ? 'none' : (level ?? 'none')]
            } ${
              lit ? 'animate-pulse ring-[3px] ring-sky-500' : ''
            } ${highlight && highlight.size > 0 && !lit ? 'opacity-40' : ''}`}
          >
            <span className={`flex w-full items-center gap-1 text-xs font-semibold ${selected ? 'text-white' : 'text-neutral-600 dark:text-neutral-300'}`}>
              {selected && <Check className="size-3.5 shrink-0" strokeWidth={3} aria-hidden />}
              <span className="truncate">{loc.label}</span>
              {here.length > 0 && (
                <span className="ml-auto shrink-0 rounded-full bg-white/80 px-1.5 text-[11px] text-neutral-800 dark:bg-black/40 dark:text-neutral-100">
                  {here.length}
                </span>
              )}
            </span>
            {!compact && names.length > 0 && (
              <span className={`mt-0.5 line-clamp-2 text-xs ${selected ? 'text-white/90' : 'text-neutral-700 dark:text-neutral-300'}`}>
                {names.slice(0, 3).join(', ')}
                {names.length > 3 && ` +${names.length - 3}`}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
