import { useState } from 'react'
import { Button, ErrorText } from '../components/ui'
import { parseLoginInput } from '../lib/authLink'
import { errorMessage, supabase } from '../lib/supabase'

/**
 * Safari na iPhonu po klepnutí na odkaz z e-mailu. Přihlášení nepoužije tady,
 * ale nabídne ho zkopírovat do aplikace na ploše (viz handoffUrl v lib/supabase).
 */
export function HandoffPage({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsed = new URL(url)
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''))
  const failed =
    hash.get('error_code') || hash.get('error') || parsed.searchParams.get('error_code') || parsed.searchParams.get('error')

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setError('Kopírování se nepovedlo. Zkus to znovu.')
    }
  }

  async function stayHere() {
    const input = parseLoginInput(url)
    if (input.kind !== 'session') return
    const { error } = await supabase.auth.setSession({ access_token: input.accessToken, refresh_token: input.refreshToken })
    if (error) setError(errorMessage(error))
    else window.location.replace('/')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center space-y-5 px-6 py-10">
      <div className="text-center">
        <img src="/favicon.svg" alt="" className="mx-auto mb-3 size-16" />
        <h1 className="text-2xl font-bold">{failed ? 'Odkaz už neplatí' : 'Skoro hotovo'}</h1>
      </div>

      {failed ? (
        <p className="text-neutral-600 dark:text-neutral-400">
          Tenhle odkaz už byl použitý nebo vypršel. Platí jen jednou a jen ten nejnovější. V aplikaci si nech poslat
          nový e-mail a na odkaz <strong>jen klepni</strong> (nedrž na něm prst, náhled ho spotřebuje).
        </p>
      ) : (
        <>
          <ol className="list-decimal space-y-2 pl-5 text-neutral-700 dark:text-neutral-300">
            <li>Klepni na <strong>Zkopírovat přihlášení</strong>.</li>
            <li>
              Otevři <strong>Plánovač z plochy</strong> a vlož to do pole „Odkaz z e-mailu“.
            </li>
          </ol>
          <Button className="w-full" onClick={() => void copy()}>
            {copied ? 'Zkopírováno ✓ – teď vlož do aplikace' : 'Zkopírovat přihlášení'}
          </Button>
          <ErrorText>{error}</ErrorText>
          <Button variant="ghost" className="w-full" onClick={() => void stayHere()}>
            Ne, chci aplikaci používat tady v Safari
          </Button>
        </>
      )}
    </main>
  )
}
