import { BookOpen, ChevronRight, Grid3x3, Package, Sparkles, Tags, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Card, ErrorText, PageHeader } from '../../components/ui'
import { useHousehold } from '../../household/HouseholdProvider'
import { errorMessage, supabase } from '../../lib/supabase'
import { pluralDays } from '../../stock/expiry'
import { useStock } from '../../stock/StockProvider'
import { BackLink } from './ZonesPage'

function Row({ to, icon: Icon, label, hint }: { to: string; icon: LucideIcon; label: string; hint: string }) {
  return (
    <Link to={to} className="flex min-h-16 items-center gap-3 px-4 hover:bg-neutral-50 dark:hover:bg-neutral-800">
      <Icon className="size-5 text-neutral-500" />
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-neutral-500">{hint}</span>
      </span>
      <ChevronRight className="size-5 text-neutral-400" />
    </Link>
  )
}

export function SettingsPage() {
  const { isAdmin } = useHousehold()
  const { zones, categories, products, settings, warnDays, reload } = useStock()
  const [error, setError] = useState<string | null>(null)

  async function setWarn(days: number) {
    if (!settings) return
    setError(null)
    const { error } = await supabase.from('settings').update({ expiry_warn_days: days }).eq('household_id', settings.household_id)
    if (error) setError(errorMessage(error))
    else await reload()
  }

  return (
    <div className="max-w-2xl">
      <BackLink to="/vice" label="Více" />
      <PageHeader title="Nastavení" />
      <div className="mb-4 divide-y divide-neutral-200 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
        <Row to="/vice/nastaveni/zony" icon={Grid3x3} label="Zóny a mřížky" hint={zones.map((z) => z.name).join(', ') || 'Žádné'} />
        <Row to="/vice/nastaveni/kategorie" icon={Tags} label="Kategorie a trvanlivosti" hint={`${categories.length} kategorií`} />
        <Row to="/vice/nastaveni/produkty" icon={Package} label="Produkty" hint={`${products.filter((p) => !p.archived).length} produktů`} />
        <Row to="/vice/nastaveni/kapitoly" icon={BookOpen} label="Kapitoly kuchařky" hint="Polévky, Těstoviny, Sladké…" />
        <Row
          to="/vice/nastaveni/ai"
          icon={Sparkles}
          label="AI funkce"
          hint={settings?.ai_enabled ? 'Zapnuto' : 'Vypnuto – recept z fotky, účtenka'}
        />
      </div>

      <Card title="Upozornění na expiraci">
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          „Zachraň dnes“ ukáže položky, které projdou do {pluralDays(warnDays)}.
        </p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 5, 7].map((d) => (
            <button
              key={d}
              disabled={!isAdmin}
              onClick={() => void setWarn(d)}
              className={`min-h-10 rounded-full px-4 text-sm font-medium ring-1 disabled:opacity-60 ${
                d === warnDays
                  ? 'bg-brand-700 text-white ring-brand-700'
                  : 'ring-neutral-300 dark:ring-neutral-700'
              }`}
            >
              {pluralDays(d)}
            </button>
          ))}
        </div>
        {!isAdmin && <p className="mt-2 text-sm text-neutral-500">Měnit to může správce domácnosti.</p>}
        <ErrorText>{error}</ErrorText>
      </Card>

      <p className="mt-6 text-sm text-neutral-500">Živý obraz přibude v další fázi.</p>
    </div>
  )
}
