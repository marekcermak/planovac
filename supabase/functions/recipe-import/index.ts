// Edge Function recipe-import: odkaz → recept ze schema.org/Recipe (JSON-LD), bez AI.
// Když stránka strukturovaný recept nemá, vrátí found=false s titulkem a obrázkem;
// klient pak (je-li AI zapnutá) zavolá funkci `ai` s feature recipe_extract.
import { CORS, fetchPage, json, pageImage, pageTitle } from '../_shared/http.ts'
import { extract } from '../_shared/recipe-jsonld.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Jen POST.' }, 405)

  let url: string
  try {
    url = String((await req.json())?.url ?? '').trim()
  } catch {
    return json({ error: 'Neplatný požadavek.' }, 400)
  }

  try {
    const page = await fetchPage(url)
    const draft = extract(page.html)
    if (draft && (draft.ingredient_lines.length > 0 || draft.steps.length > 0)) {
      return json({ found: true, url: page.url, draft })
    }
    return json({ found: false, url: page.url, title: pageTitle(page.html) ?? null, image_url: pageImage(page.html) ?? null })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Stránku se nepodařilo načíst.' }, 502)
  }
})
