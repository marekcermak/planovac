export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const UA = 'Mozilla/5.0 (compatible; Planovac/0.1; +https://planovac-topaz.vercel.app)'

/** Stáhne HTML stránky (jen http/https, max ~3 MB, timeout 15 s). */
export async function fetchPage(rawUrl: string): Promise<{ url: string; html: string }> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Neplatný odkaz.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Odkaz musí začínat http(s)://')
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname)) throw new Error('Tenhle odkaz nejde otevřít.')

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'cs,en;q=0.8', Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Stránka vrátila chybu ${res.status}.`)
  const text = await res.text()
  return { url: res.url || url.toString(), html: text.slice(0, 3_000_000) }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}

/** HTML → čitelný text (pro AI): bez skriptů, stylů, navigace; zachová odřádkování. */
export function htmlToText(html: string, max = 40_000): string {
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/div|\/tr)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(body)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n')
    .trim()
    .slice(0, max)
}

export function pageTitle(html: string): string | undefined {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
  const t = og ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
  return t ? decodeEntities(t).trim().slice(0, 160) : undefined
}

export function pageImage(html: string): string | undefined {
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
  return m && /^https?:\/\//.test(m) ? m : undefined
}
