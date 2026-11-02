import { Check, Copy, Share } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Avatar, Button, Card, ColorPicker, ErrorText, Field, PageHeader } from '../components/ui'
import { useHousehold } from '../household/HouseholdProvider'
import type { Tables } from '../lib/database.types'
import { errorMessage, supabase } from '../lib/supabase'

type Invite = Tables<'household_invites'>

const dateFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric' })

function inviteUrl(token: string) {
  return `${window.location.origin}/pozvanka/${token}`
}

function ProfileForm() {
  const { me, refresh } = useHousehold()
  const [name, setName] = useState(me?.display_name ?? '')
  const [color, setColor] = useState(me?.color ?? '#2563eb')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (!me) return null

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!me) return
    setBusy(true)
    setError(null)
    setSaved(false)
    const { error } = await supabase
      .from('household_members')
      .update({ display_name: name, color })
      .eq('household_id', me.household_id)
      .eq('user_id', me.user_id)
    setBusy(false)
    if (error) return setError(errorMessage(error))
    setSaved(true)
    await refresh()
  }

  return (
    <Card title="Můj profil">
      <form onSubmit={save} className="space-y-4">
        <Field label="Jméno" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <ColorPicker value={color} onChange={setColor} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="secondary" disabled={busy}>
          {saved ? <Check className="size-5" /> : null} Uložit
        </Button>
      </form>
    </Card>
  )
}

function Invites() {
  const { household } = useHousehold()
  const [invites, setInvites] = useState<Invite[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!household) return
    const { data, error } = await supabase
      .from('household_invites')
      .select('*')
      .eq('household_id', household.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    if (error) setError(errorMessage(error))
    else setInvites(data)
  }, [household])

  useEffect(() => {
    void load()
  }, [load])

  async function create() {
    if (!household) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('create_invite', { p_household_id: household.id })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    await load()
  }

  async function revoke(id: string) {
    const { error } = await supabase
      .from('household_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return setError(errorMessage(error))
    await load()
  }

  async function share(token: string) {
    const url = inviteUrl(token)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Pozvánka do Plánovače', text: `Přidej se k nám do Plánovače: ${url}` })
        return
      } catch {
        /* zrušeno uživatelem – zkopírujeme */
      }
    }
    await copy(token)
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token))
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setError('Kopírování se nepovedlo. Označ odkaz a zkopíruj ho ručně.')
    }
  }

  return (
    <Card title="Pozvat člena">
      <p className="mb-3 text-sm text-neutral-500">
        Vytvoř odkaz a pošli ho třeba přes WhatsApp nebo SMS. Odkaz platí 7 dní a jde použít jen jednou.
      </p>
      {invites.map((inv) => (
        <div key={inv.id} className="mb-3 rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800">
          <p className="mb-2 text-sm break-all select-all">{inviteUrl(inv.token)}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void share(inv.token)}>
              <Share className="size-4" /> Poslat
            </Button>
            <Button variant="secondary" onClick={() => void copy(inv.token)}>
              {copied === inv.token ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied === inv.token ? 'Zkopírováno' : 'Kopírovat'}
            </Button>
            <Button variant="danger" onClick={() => void revoke(inv.id)}>
              Zrušit
            </Button>
            <span className="text-xs text-neutral-500">platí do {dateFmt.format(new Date(inv.expires_at))}</span>
          </div>
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
      <Button variant={invites.length ? 'secondary' : 'primary'} disabled={busy} onClick={() => void create()}>
        {busy ? 'Vytvářím…' : 'Vytvořit pozvánku'}
      </Button>
    </Card>
  )
}

export function HouseholdPage() {
  const { household, members, me, isAdmin } = useHousehold()

  return (
    <>
      <PageHeader title="Domácnost" subtitle={household?.name} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Členové">
          <ul className="space-y-3">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3">
                <Avatar name={m.display_name} color={m.color} />
                <div className="flex-1">
                  <div className="font-medium">
                    {m.display_name}
                    {m.user_id === me?.user_id && <span className="text-neutral-500"> (ty)</span>}
                  </div>
                  <div className="text-sm text-neutral-500">{m.role === 'admin' ? 'správce' : 'člen'}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        {isAdmin && <Invites />}
        <ProfileForm />
      </div>
    </>
  )
}
