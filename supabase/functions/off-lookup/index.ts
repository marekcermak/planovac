// Edge Function off-lookup: čárový kód → základní údaje produktu z Open Food Facts.
// Volá jen přihlášený uživatel (verify_jwt). Výsledky (i „nenalezeno“) se cachují v public.off_cache.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FOUND_TTL_DAYS = 90
const MISSING_TTL_DAYS = 7
const FIELDS = [
  'product_name',
  'product_name_cs',
  'generic_name_cs',
  'brands',
  'quantity',
  'image_front_small_url',
  'categories_tags',
].join(',')

type Result = {
  found: boolean
  name?: string
  brand?: string
  quantity?: string
  image_url?: string
  categories?: string[]
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function clean(s: unknown): string | undefined {
  return typeof s === 'string' && s.trim() ? s.trim().slice(0, 120) : undefined
}

async function fetchOff(barcode: string): Promise<Result> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${FIELDS}`, {
    headers: { 'User-Agent': 'Planovac/0.1 (domaci PWA; planovac-topaz.vercel.app)' },
  })
  if (res.status === 404) return { found: false }
  if (!res.ok) throw new Error(`Open Food Facts odpověděl ${res.status}`)
  const body = await res.json()
  const p = body?.product
  if (body?.status !== 1 || !p) return { found: false }
  const name = clean(p.product_name_cs) ?? clean(p.product_name) ?? clean(p.generic_name_cs)
  return {
    found: !!name,
    name,
    brand: clean(typeof p.brands === 'string' ? p.brands.split(',')[0] : undefined),
    quantity: clean(p.quantity),
    image_url: clean(p.image_front_small_url),
    categories: Array.isArray(p.categories_tags) ? p.categories_tags.slice(0, 40) : [],
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Jen POST.' }, 405)

  let barcode: string
  try {
    barcode = String((await req.json())?.barcode ?? '').replace(/\D/g, '')
  } catch {
    return json({ error: 'Neplatný požadavek.' }, 400)
  }
  if (!/^[0-9]{6,14}$/.test(barcode)) return json({ error: 'Neplatný čárový kód.' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data: cached } = await admin.from('off_cache').select('*').eq('barcode', barcode).maybeSingle()
  if (cached) {
    const ageDays = (Date.now() - new Date(cached.fetched_at).getTime()) / 86_400_000
    if (ageDays < (cached.found ? FOUND_TTL_DAYS : MISSING_TTL_DAYS)) {
      return json({ ...(cached.data as Result), found: cached.found, cached: true })
    }
  }

  let result: Result
  try {
    result = await fetchOff(barcode)
  } catch (e) {
    // Při výpadku OFF vrátit aspoň starou mezipaměť.
    if (cached) return json({ ...(cached.data as Result), found: cached.found, cached: true })
    return json({ error: e instanceof Error ? e.message : 'Open Food Facts nejde načíst.' }, 502)
  }

  await admin
    .from('off_cache')
    .upsert({ barcode, found: result.found, data: result, fetched_at: new Date().toISOString() })
  return json({ ...result, cached: false })
})
