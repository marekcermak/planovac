import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Chybí VITE_SUPABASE_URL nebo VITE_SUPABASE_PUBLISHABLE_KEY (viz .env.example).')
}

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
    if (/token has expired|invalid/i.test(msg)) return 'Kód je neplatný nebo vypršel.'
    if (/failed to fetch|network/i.test(msg)) return 'Nejde se připojit k serveru. Jsi online?'
    return msg
  }
  return 'Něco se pokazilo.'
}
