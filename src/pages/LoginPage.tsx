import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Button, ErrorText, Field } from '../components/ui'
import { parseLoginInput } from '../lib/authLink'
import { errorMessage, supabase } from '../lib/supabase'

/** Povolí jen relativní cestu v rámci aplikace (ochrana proti open redirectu). */
export function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export function LoginPage() {
  const { session } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session) return <Navigate to={next} replace />

  async function sendEmail(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + next },
    })
    setBusy(false)
    if (error) setError(errorMessage(error))
    else setStep('code')
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const input = parseLoginInput(code)
    if (input.kind === 'invalid') {
      setBusy(false)
      setError('Tohle nevypadá jako odkaz ani kód z e-mailu. Zkopíruj celý odkaz (podrž prst na tlačítku v e-mailu → Kopírovat odkaz).')
      return
    }
    const { error } =
      input.kind === 'code'
        ? await supabase.auth.verifyOtp({ email: email.trim(), token: input.code, type: 'email' })
        : input.kind === 'tokenHash'
          ? await supabase.auth.verifyOtp({ token_hash: input.tokenHash, type: input.type })
          : await supabase.auth.setSession({ access_token: input.accessToken, refresh_token: input.refreshToken })
    setBusy(false)
    if (error) setError(errorMessage(error))
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <img src="/favicon.svg" alt="" className="mx-auto mb-3 size-16" />
        <h1 className="text-3xl font-bold">Plánovač</h1>
        <p className="mt-1 text-neutral-500">Zásoby, kuchařka, úkoly a návyky pro celou domácnost</p>
      </div>

      {step === 'email' ? (
        <form onSubmit={sendEmail} className="space-y-4">
          <Field
            label="E-mail"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Posílám…' : 'Poslat přihlašovací e-mail'}
          </Button>
          <p className="text-center text-sm text-neutral-500">Heslo není potřeba. Pošleme ti přihlašovací odkaz.</p>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-4">
          <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-800/30 dark:text-brand-100">
            Poslali jsme e-mail na <strong>{email}</strong>. Když nic nepřišlo, podívej se i do spamu.
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-400">
            <li>V e-mailu podrž prst na odkazu a zvol <strong>Kopírovat odkaz</strong> (neklikej na něj).</li>
            <li>Vlož ho sem a přihlas se.</li>
          </ol>
          <Field
            label="Odkaz z e-mailu"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            hint="Na počítači stačí na odkaz kliknout. Na iPhonu by se otevřel v Safari, ne v aplikaci na ploše."
          />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Ověřuji…' : 'Přihlásit'}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setStep('email')}>
            Zpět / jiný e-mail
          </Button>
        </form>
      )}
    </main>
  )
}
