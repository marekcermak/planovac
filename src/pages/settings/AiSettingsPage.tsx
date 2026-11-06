import { CheckCircle2, CircleAlert } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, ErrorText, Field, PageHeader, SelectField } from '../../components/ui'
import { useHousehold } from '../../household/HouseholdProvider'
import { useAi } from '../../lib/AiProvider'
import type { TablesUpdate } from '../../lib/database.types'
import { errorMessage, supabase } from '../../lib/supabase'
import { useStock } from '../../stock/StockProvider'
import { BackLink } from './ZonesPage'

/** Modely a ceny v Kč za milion tokenů (podle ceníku Anthropic, ~24 Kč/$). */
const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 – levný a rychlý (doporučeno)', input: 2.4, output: 12 },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 – přesnější u špatně čitelných fotek', input: 48, output: 240 },
]

const FEATURE_NAMES: Record<string, string> = {
  recipe_extract: 'Recept z fotky / textu / webu',
  receipt_photo: 'Účtenka',
}

const czk = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 2 })

export function AiSettingsPage() {
  const { isAdmin } = useHousehold()
  const { settings, reload } = useStock()
  const { status, refresh } = useAi()
  const [limit, setLimit] = useState(String(settings?.ai_monthly_limit_czk ?? 100))
  const [error, setError] = useState<string | null>(null)

  async function save(patch: TablesUpdate<'settings'>) {
    if (!settings) return
    setError(null)
    const { error } = await supabase.from('settings').update(patch).eq('household_id', settings.household_id)
    if (error) return setError(errorMessage(error))
    await Promise.all([reload(), refresh()])
  }

  const model = MODELS.find((m) => m.id === settings?.ai_model)

  return (
    <div className="max-w-2xl space-y-4">
      <BackLink to="/vice/nastaveni" label="Nastavení" />
      <PageHeader title="AI funkce" subtitle="Recept z fotky, účtenka… Aplikace funguje i bez AI." />

      <Card>
        <div className="flex items-start gap-3">
          {status?.configured ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
          ) : (
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-orange-600" />
          )}
          <div className="text-sm">
            {status?.configured ? (
              <p>Klíč ke Claude API je na serveru nastavený.</p>
            ) : (
              <>
                <p className="mb-2 font-medium">
                  {status?.key_problem === 'invalid'
                    ? 'Klíč v Supabase má špatný tvar (navíc uvozovky, mezera nebo neviditelný znak). Vlož ho znovu – jen samotný klíč začínající sk-ant-.'
                    : 'Klíč ke Claude API zatím chybí.'}
                </p>
                <ol className="list-decimal space-y-1 pl-5 text-neutral-600 dark:text-neutral-400">
                  <li>
                    Na <a className="text-brand-700 underline dark:text-brand-500" href="https://console.anthropic.com" target="_blank" rel="noreferrer">console.anthropic.com</a> si
                    založ účet, dobij pár dolarů kreditu a vytvoř API klíč.
                  </li>
                  <li>
                    V Supabase: projekt → Edge Functions → Secrets → přidej <code>ANTHROPIC_API_KEY</code> s tím klíčem.
                  </li>
                  <li>Vrať se sem a zapni AI.</li>
                </ol>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card title="Nastavení">
        <div className="space-y-4">
          <label className="flex min-h-12 items-center gap-3">
            <input
              type="checkbox"
              className="size-6 accent-brand-700"
              disabled={!isAdmin}
              checked={settings?.ai_enabled ?? false}
              onChange={(e) => void save({ ai_enabled: e.target.checked })}
            />
            <span className="font-medium">AI funkce zapnuté</span>
          </label>
          <SelectField
            label="Model"
            disabled={!isAdmin}
            value={settings?.ai_model ?? MODELS[0].id}
            onChange={(e) => {
              const m = MODELS.find((x) => x.id === e.target.value)
              if (m) void save({ ai_model: m.id, ai_price_input_per_mtok: m.input, ai_price_output_per_mtok: m.output })
            }}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </SelectField>
          {model && (
            <p className="-mt-2 text-xs text-neutral-500">
              Cena: {model.input} Kč / {model.output} Kč za milion tokenů (vstup / výstup). Fotka receptu ≈ 3–5 tisíc tokenů.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const n = Number(limit.replace(',', '.'))
              if (Number.isFinite(n) && n >= 0) void save({ ai_monthly_limit_czk: n })
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1">
              <Field label="Měsíční limit útraty (Kč)" inputMode="decimal" disabled={!isAdmin} value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
            <Button type="submit" variant="secondary" disabled={!isAdmin}>
              Uložit
            </Button>
          </form>
          {!isAdmin && <p className="text-sm text-neutral-500">Měnit to může správce domácnosti.</p>}
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>

      {status && (
        <Card title="Útrata tento měsíc">
          <p className="mb-3 text-2xl font-bold">
            {czk.format(status.spent_czk)} <span className="text-base font-normal text-neutral-500">z {czk.format(status.limit_czk)}</span>
          </p>
          {Object.keys(status.by_feature).length > 0 ? (
            <ul className="space-y-1 text-sm">
              {Object.entries(status.by_feature).map(([f, v]) => (
                <li key={f} className="flex gap-2">
                  <span className="flex-1">{FEATURE_NAMES[f] ?? f}</span>
                  <span className="text-neutral-500">{v.calls}×</span>
                  <span className="w-20 text-right tabular-nums">{czk.format(v.czk)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">Zatím žádná volání.</p>
          )}
        </Card>
      )}
    </div>
  )
}
