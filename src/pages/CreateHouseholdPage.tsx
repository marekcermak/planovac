import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { signOut } from '../auth/AuthProvider'
import { Button, ColorPicker, ErrorText, Field, MEMBER_COLORS } from '../components/ui'
import { useHousehold } from '../household/HouseholdProvider'
import { errorMessage, supabase } from '../lib/supabase'

export function CreateHouseholdPage() {
  const { household, refresh } = useHousehold()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [color, setColor] = useState(MEMBER_COLORS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (household) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('create_household', {
      p_name: name,
      p_display_name: displayName,
      p_color: color,
    })
    if (error) {
      setError(errorMessage(error))
      setBusy(false)
      return
    }
    await refresh()
  }

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <h1 className="text-2xl font-bold">Vítej v Plánovači</h1>
      <p className="mt-1 mb-6 text-neutral-500">
        Založ domácnost. Partnera do ní pak pozveš odkazem.
      </p>
      <form onSubmit={submit} className="space-y-5">
        <Field
          label="Název domácnosti"
          placeholder="např. Doma"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Tvoje jméno"
          placeholder="např. Marek"
          required
          maxLength={40}
          autoComplete="given-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <ColorPicker value={color} onChange={setColor} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Zakládám…' : 'Založit domácnost'}
        </Button>
      </form>
      <div className="mt-8 rounded-2xl bg-neutral-100 p-4 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
        Máš pozvánku? Otevři odkaz, který ti partner poslal. Tím se přidáš do jeho domácnosti.
      </div>
      <Button variant="ghost" className="mt-4 w-full" onClick={() => void signOut()}>
        Odhlásit se
      </Button>
    </main>
  )
}
