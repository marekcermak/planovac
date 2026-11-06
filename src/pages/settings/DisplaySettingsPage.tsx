import { CheckCircle2, CircleAlert, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../components/Toast'
import { Button, Card, ErrorText, PageHeader } from '../../components/ui'
import { useDisplay } from '../../display/DisplayProvider'
import { useHousehold } from '../../household/HouseholdProvider'
import type { Json } from '../../lib/database.types'
import { errorMessage, supabase } from '../../lib/supabase'
import { useStock } from '../../stock/StockProvider'
import { BackLink } from './ZonesPage'

const FIELDS: { key: string; label: string; hint: string; def: boolean }[] = [
  { key: 'jidlo', label: 'Jídelníček', hint: 'jidlo_dnes, jidlo_zitra, jidlo_tyden', def: false },
  { key: 'ukoly', label: 'Společné úkoly', hint: 'ukoly_dnes (dnes a po termínu), ukoly_tyden (do neděle) – soukromé nikdy', def: false },
  { key: 'prochazi', label: 'Co prochází', hint: 'prochazi, prochazi_pocet', def: false },
  { key: 'nakup', label: 'Počet věcí na nákup', hint: 'nakup_pocet', def: false },
]

type Status = { has_key: boolean; last_push_at: string | null; status_code: number | null; error: string | null }

const timeFmt = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' })

/** Nastavení → Živý obraz: zapnutí, importní klíč, která pole posílat, náhled hodnot, Odeslat teď. */
export function DisplaySettingsPage() {
  const { household, isAdmin } = useHousehold()
  const { settings, reload } = useStock()
  const { pushNow } = useDisplay()
  const toast = useToast()
  const hh = household?.id
  const [status, setStatus] = useState<Status | null>(null)
  const [preview, setPreview] = useState<Record<string, string> | null>(null)
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fields = (settings?.display_fields ?? {}) as Record<string, boolean>

  const load = useCallback(async () => {
    if (!hh) return
    const [s, p] = await Promise.all([
      supabase.rpc('display_status', { p_household_id: hh }),
      supabase.rpc('display_preview', { p_household_id: hh }),
    ])
    if (s.data) setStatus(s.data as unknown as Status)
    if (p.data) setPreview(p.data as Record<string, string>)
    const err = s.error ?? p.error
    if (err) setError(errorMessage(err))
  }, [hh])

  useEffect(() => {
    void load()
  }, [load])

  async function saveSettings(patch: { zivyobraz_enabled?: boolean; display_fields?: Json }) {
    if (!hh) return
    setError(null)
    const { error } = await supabase.from('settings').update(patch).eq('household_id', hh)
    if (error) return setError(errorMessage(error))
    await reload()
    await load()
  }

  async function saveKey(value: string | null) {
    if (!hh) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('set_display_key', { p_household_id: hh, p_key: value ?? '' })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setKey('')
    toast(value ? 'Klíč uložen' : 'Klíč smazán')
    await load()
  }

  async function sendNow() {
    setBusy(true)
    setError(null)
    try {
      const ok = await pushNow()
      toast(ok ? 'Odesílám (nejvýš 1× za minutu) – displej se obnoví při příštím probuzení' : 'Neodesláno: zapni Živý obraz a zadej klíč', ok ? 'ok' : 'error')
      // Odpověď serveru dorazí za chvilku.
      setTimeout(() => void load(), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se odeslat.')
    } finally {
      setBusy(false)
    }
  }

  const ok = status?.status_code != null && status.status_code < 400 && !status.error

  return (
    <div className="max-w-2xl space-y-4">
      <BackLink to="/vice/nastaveni" label="Nastavení" />
      <PageHeader title="Živý obraz" subtitle="E-ink displej ze zivyobraz.eu – denní přehled pro celou domácnost." />

      <Card>
        <div className="space-y-4">
          <label className="flex min-h-12 items-center gap-3">
            <input
              type="checkbox"
              className="size-6 accent-brand-700"
              disabled={!isAdmin}
              checked={settings?.zivyobraz_enabled ?? false}
              onChange={(e) => void saveSettings({ zivyobraz_enabled: e.target.checked })}
            />
            <span className="font-medium">Posílat na displej</span>
          </label>

          <div>
            <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Importní klíč</span>
            <p className="mb-2 text-sm text-neutral-500">
              {status?.has_key ? 'Klíč je uložený (z bezpečnostních důvodů se nezobrazuje).' : 'Najdeš ho na zivyobraz.eu v nastavení účtu u importu hodnot.'}
            </p>
            {isAdmin && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (key.trim()) void saveKey(key.trim())
                }}
              >
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={status?.has_key ? 'Nový klíč' : 'Vlož klíč'}
                  className="block min-h-12 flex-1 rounded-xl border border-neutral-300 bg-white px-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
                />
                <Button type="submit" variant="secondary" disabled={busy || !key.trim()}>
                  Uložit
                </Button>
                {status?.has_key && (
                  <Button type="button" variant="danger" disabled={busy} onClick={() => void saveKey(null)}>
                    Smazat
                  </Button>
                )}
              </form>
            )}
          </div>
          {!isAdmin && <p className="text-sm text-neutral-500">Měnit to může správce domácnosti.</p>}
        </div>
      </Card>

      <Card title="Co posílat automaticky">
        <p className="mb-3 text-sm text-neutral-500">
          Ve výchozím stavu nic – na displej jde jen to, co pošleš tlačítkem 📟 (u úkolu, jídla, zápisu, položky skladu).
        </p>
        <ul className="space-y-2">
          {FIELDS.map((f) => (
            <li key={f.key}>
              <label className="flex min-h-11 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-5 accent-brand-700"
                  disabled={!isAdmin}
                  checked={fields[f.key] ?? f.def}
                  onChange={(e) => void saveSettings({ display_fields: { ...fields, [f.key]: e.target.checked } })}
                />
                <span>
                  <span className="block font-medium">{f.label}</span>
                  <span className="block text-xs text-neutral-500">{f.hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-neutral-500">
          Vždy se posílá datum, čas aktualizace a ručně připnuté položky (jméno_pripnuto_1 až _3, jméno_pripnuto).
          Soukromé úkoly, návyky a nálady nikdy.
        </p>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <span className="flex-1">Náhled hodnot</span>
            <button aria-label="Obnovit náhled" onClick={() => void load()} className="p-1 text-neutral-500">
              <RefreshCw className="size-4" />
            </button>
          </span>
        }
      >
        {preview ? (
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(preview)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => (
                  <tr key={k} className="border-t border-neutral-100 first:border-0 dark:border-neutral-800">
                    <td className="py-1.5 pr-3 align-top font-mono text-xs text-neutral-500">{k}</td>
                    <td className="py-1.5">{v || <span className="text-neutral-400">—</span>}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-neutral-500">Načítám…</p>
        )}
        <p className="mt-3 text-xs text-neutral-500">Tyhle názvy použij v editoru Živého obrazu. Posílá se automaticky do minuty po změně, jinak každých 10 minut.</p>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          {status?.last_push_at ? (
            ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-orange-600" />
          ) : null}
          <div className="flex-1 text-sm">
            {status?.last_push_at ? (
              <>
                <p>Naposledy odesláno {timeFmt.format(new Date(status.last_push_at))}.</p>
                {status.status_code != null && <p className="text-neutral-500">Odpověď serveru: {status.status_code}</p>}
                {status.error && <p className="text-red-700 dark:text-red-400">{status.error}</p>}
              </>
            ) : (
              <p className="text-neutral-500">Zatím nic neodesláno.</p>
            )}
          </div>
          <Button variant="secondary" disabled={busy || !status?.has_key || !settings?.zivyobraz_enabled} onClick={() => void sendNow()}>
            Odeslat teď
          </Button>
        </div>
      </Card>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
