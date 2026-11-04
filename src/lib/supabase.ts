import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Chybí VITE_SUPABASE_URL nebo VITE_SUPABASE_PUBLISHABLE_KEY (viz .env.example).')
}

/**
 * iPhone: odkaz z e-mailu se vždy otevře v Safari, ne v PWA na ploše (mají oddělená úložiště).
 * Když Safari (mimo PWA) dostane přihlašovací tokeny v adrese, nepoužije je, ale schová si
 * je pro HandoffPage, která je nabídne zkopírovat do aplikace na ploše. Tokeny tak použije
 * jen PWA a Safari s nimi nesoupeří o obnovu (refresh token je jednorázový).
 */
function isIosBrowserTab(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  return ios && !standalone
}

export const handoffUrl: string | null =
  isIosBrowserTab() && /[#&](refresh_token|error_code)=/.test(window.location.hash) ? window.location.href : null
if (handoffUrl) window.history.replaceState(null, '', window.location.pathname + window.location.search)

export const supabase = createClient<Database>(url, key, {
  auth: {
    // Implicit flow: odkaz z e-mailu funguje i v jiném prohlížeči, než kde byl vyžádán
    // (na iPhonu má PWA na ploše oddělené úložiště od Safari).
    flowType: 'implicit',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** Převede chybu ze Supabase na srozumitelnou českou hlášku. */
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message: unknown }).message)
    if (/rate limit|security purposes/i.test(msg)) {
      return 'Moc pokusů najednou. Zkus to prosím za chvíli znovu.'
    }
    if (/token has expired|invalid|expired/i.test(msg)) {
      return 'Odkaz už byl použitý nebo vypršel (platí jen jednou a jen ten nejnovější). Nech si poslat nový.'
    }
    if (/failed to fetch|network/i.test(msg)) return 'Nejde se připojit k serveru. Jsi online?'
    return msg
  }
  return 'Něco se pokazilo.'
}
