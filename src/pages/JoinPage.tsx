import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button, ColorPicker, ErrorText, Field, MEMBER_COLORS, Splash } from '../components/ui'
import { useHousehold } from '../household/HouseholdProvider'
import { errorMessage, supabase } from '../lib/supabase'

type Invite = { household_name: string; invited_by: string; status: string }
type Summary = {
  household_name: string
  members: number
  stock_items: number
  recipes: number
  tasks: number
  journal_entries: number
}

const STATUS_TEXT: Record<string, string> = {
  used: 'Tahle pozvánka už byla použitá.',
  expired: 'Platnost pozvánky vypršela. Požádej o novou.',
  revoked: 'Pozvánka byla zrušena. Požádej o novou.',
}

export function JoinPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { household, refresh } = useHousehold()
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined)
  const [displayName, setDisplayName] = useState('')
  const [color, setColor] = useState(MEMBER_COLORS[1])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    supabase.rpc('get_invite', { p_token: token }).then(({ data, error }) => {
      if (error) setError(errorMessage(error))
      setInvite(data?.[0] ?? null)
    })
  }, [token])

  useEffect(() => {
    if (!household) return
    supabase.rpc('current_household_summary').then(({ data }) => setSummary(data?.[0] ?? null))
  }, [household])

  async function accept(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const args = {
      p_token: token,
      p_display_name: displayName,
      p_color: color,
    }
    // Kdo už domácnost má (třeba si ji omylem založil), přejde: sám → stará se smaže, jinak ji opustí.
    const { error } = household
      ? await supabase.rpc('switch_household', args)
      : await supabase.rpc('accept_invite', args)
    if (error) {
      setError(errorMessage(error))
      setBusy(false)
      return
    }
    await refresh()
    navigate('/', { replace: true })
  }

  if (invite === undefined) return <Splash />

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <img src="/favicon.svg" alt="" className="mb-4 size-14" />
      {!invite ? (
        <>
          <h1 className="text-2xl font-bold">Pozvánka nenalezena</h1>
          <p className="mt-2 text-neutral-500">Zkontroluj, že máš celý odkaz, nebo požádej o nový.</p>
          <ErrorText>{error}</ErrorText>
        </>
      ) : invite.status !== 'valid' ? (
        <>
          <h1 className="text-2xl font-bold">Pozvánka neplatí</h1>
          <p className="mt-2 text-neutral-500">{STATUS_TEXT[invite.status]}</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">Pozvánka do domácnosti</h1>
          <p className="mt-1 mb-6 text-neutral-500">
            {invite.invited_by} tě zve do domácnosti <strong>„{invite.household_name}“</strong>.
          </p>
          <form onSubmit={accept} className="space-y-5">
            <Field
              label="Tvoje jméno"
              placeholder="např. Markéta"
              required
              maxLength={40}
              autoComplete="given-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <ColorPicker value={color} onChange={setColor} />
            {household && summary && (
              <div className="space-y-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                {summary.members <= 1 ? (
                  <>
                    <p>
                      Teď máš vlastní domácnost <strong>„{summary.household_name}“</strong> ({summary.stock_items}{' '}
                      položek ve skladu, {summary.recipes} receptů, {summary.tasks} úkolů, {summary.journal_entries}{' '}
                      zápisů v deníku). Po přidání se <strong>smaže i se vším obsahem</strong>.
                    </p>
                    <p>Pokud máš data ty a ne {invite.invited_by}, nepřidávej se – pošli místo toho pozvánku ty.</p>
                  </>
                ) : (
                  <p>
                    Opustíš domácnost <strong>„{summary.household_name}“</strong>, ostatním členům zůstane.
                  </p>
                )}
                <label className="flex min-h-10 items-center gap-3 font-medium">
                  <input
                    type="checkbox"
                    className="size-5 accent-amber-600"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  {summary.members <= 1 ? 'Rozumím, moji domácnost smazat' : 'Rozumím, opustit domácnost'}
                </label>
              </div>
            )}
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy || (!!household && (!summary || !confirmed))} className="w-full">
              {busy ? 'Přidávám…' : 'Přidat se'}
            </Button>
          </form>
        </>
      )}
    </main>
  )
}
