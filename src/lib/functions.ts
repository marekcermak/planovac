import { supabase } from './supabase'

/**
 * Zavolá Edge Function a vrátí data; chybu převede na srozumitelnou hlášku
 * (funkce posílají { error: '…' } i s chybovým HTTP kódem).
 */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let message = 'Server je nedostupný. Jsi online?'
    try {
      const ctx = (error as { context?: Response }).context
      const j = ctx ? await ctx.json() : null
      if (j?.error) message = j.error
    } catch {
      /* ponechat obecnou hlášku */
    }
    throw new Error(message)
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) throw new Error(String(data.error))
  return data as T
}
