import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, ColorPicker, ErrorText, Field, MEMBER_COLORS, Splash } from '../components/ui'
import { useHousehold } from '../household/HouseholdProvider'
import { errorMessage, supabase } from '../lib/supabase'

type Invite = { household_name: string; invited_by: string; status: string }

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

  useEffect(() => {
    supabase.rpc('get_invite', { p_token: token }).then(({ data, error }) => {
      if (error) setError(errorMessage(error))
      setInvite(data?.[0] ?? null)
    })
  }, [token])

  async function accept(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('accept_invite', {
      p_token: token,
      p_display_name: displayName,
      p_color: color,
    })
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
      {household ? (
        <>
          <h1 className="text-2xl font-bold">Už jsi v domácnosti</h1>
          <p className="mt-2 text-neutral-500">
            Jsi členem domácnosti „{household.name}“. Do jiné se zatím přidat nejde.
          </p>
          <Link to="/" className="mt-6 inline-block font-medium text-brand-700">
            Pokračovat do aplikace →
          </Link>
        </>
      ) : !invite ? (
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
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Přidávám…' : 'Přidat se'}
            </Button>
          </form>
        </>
      )}
    </main>
  )
}
