import type { EmailOtpType } from '@supabase/supabase-js'

/** Co uživatel vložil do přihlašovacího pole: kód, odkaz z e-mailu, nebo už hotové tokeny. */
export type LoginInput =
  | { kind: 'code'; code: string }
  | { kind: 'tokenHash'; tokenHash: string; type: EmailOtpType }
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'invalid' }

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'magiclink', 'invite', 'recovery', 'email_change', 'email']

/**
 * Rozpozná vstup z přihlašovací obrazovky.
 * - samé číslice → jednorázový kód (funguje jen s vlastní šablonou e-mailu se {{ .Token }}),
 * - odkaz z e-mailu (…/auth/v1/verify?token=…&type=magiclink) → token_hash pro verifyOtp,
 * - adresa, kam odkaz přesměroval (…#access_token=…&refresh_token=…) → přímo session.
 */
export function parseLoginInput(raw: string): LoginInput {
  const text = raw.trim()
  if (/^\d{6,10}$/.test(text.replace(/\s/g, ''))) return { kind: 'code', code: text.replace(/\s/g, '') }

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { kind: 'invalid' }
  }

  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken }

  const tokenHash = url.searchParams.get('token_hash') ?? url.searchParams.get('token')
  if (tokenHash) {
    const t = url.searchParams.get('type') as EmailOtpType | null
    return { kind: 'tokenHash', tokenHash, type: t && OTP_TYPES.includes(t) ? t : 'email' }
  }
  return { kind: 'invalid' }
}
