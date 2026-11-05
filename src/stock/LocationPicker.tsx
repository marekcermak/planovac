import { useState } from 'react'
import { Chip } from '../components/ui'
import { useStock } from './StockProvider'
import { ZoneMap } from './ZoneMap'

/** Výběr místa: záložky zón + mřížka, ťuknutí na buňku = výběr. */
export function LocationPicker({
  value,
  onChange,
  preferZoneType,
}: {
  value: string | null
  onChange: (locationId: string | null) => void
  preferZoneType?: string | null
}) {
  const { zones, items, locationById } = useStock()
  const current = value ? locationById.get(value) : undefined
  const [picked, setZoneId] = useState<string | null>(null)
  // Dokud uživatel nevybere záložku: zóna aktuálního místa → zóna podle kategorie → první.
  const zoneId =
    picked ?? current?.zone_id ?? zones.find((z) => z.type === preferZoneType)?.id ?? zones[0]?.id ?? null
  const zone = zones.find((z) => z.id === zoneId)

  if (zones.length === 0) {
    return <p className="text-sm text-neutral-500">Zatím nemáš žádné zóny. Založ je v Nastavení → Zóny.</p>
  }

  return (
    <div className="space-y-2">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {zones.map((z) => (
          <Chip key={z.id} active={z.id === zoneId} onClick={() => setZoneId(z.id)}>
            {z.name}
          </Chip>
        ))}
        <Chip active={value === null} onClick={() => onChange(null)}>
          Bez místa
        </Chip>
      </div>
      {zone && <ZoneMap zone={zone} items={items} compact selectedId={value} onSelect={(id) => onChange(id)} />}
    </div>
  )
}
