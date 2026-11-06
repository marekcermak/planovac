import { X } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '../components/Toast'
import { Button, Card } from '../components/ui'
import { useHousehold } from '../household/HouseholdProvider'
import { useDisplay } from './DisplayProvider'
import { PinForm } from './PinButton'
import { Sheet } from '../components/Sheet'

/** Dnes: co je teď připnuté na displeji (odebrání jedním ťuknutím) + poslat vlastní text. */
export function DisplayCard() {
  const { enabled, pins, unpin } = useDisplay()
  const { members, me } = useHousehold()
  const toast = useToast()
  const [custom, setCustom] = useState(false)
  if (!enabled) return null

  return (
    <Card title="📟 Na displeji teď">
      {pins.length === 0 ? (
        <p className="mb-3 text-sm text-neutral-500">Nic připnutého. U úkolu, receptu, zápisu nebo položky skladu najdeš „📟 Na displej“.</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {pins.map((p) => {
            const mine = p.owner_id === me?.user_id
            const who = members.length > 1 ? members.find((m) => m.user_id === p.owner_id)?.display_name : undefined
            return (
              <li key={p.id} className="flex min-h-11 items-center gap-2">
                <span className="min-w-0 flex-1">
                  {p.text}
                  {who && <span className="ml-2 text-xs text-neutral-500">{who}</span>}
                </span>
                {mine && (
                  <button
                    aria-label={`Odebrat z displeje: ${p.text}`}
                    onClick={() => void unpin(p.id).catch((e: Error) => toast(e.message, 'error'))}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:text-red-600"
                  >
                    <X className="size-5" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <Button variant="secondary" onClick={() => setCustom(true)}>
        Poslat vlastní text
      </Button>
      <Sheet open={custom} onClose={() => setCustom(false)} title="Vlastní text na displej">
        {custom && <PinForm kind="text" initial="" onDone={() => setCustom(false)} />}
      </Sheet>
    </Card>
  )
}
