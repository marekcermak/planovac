// schema.org/Recipe (JSON-LD) → koncept receptu. Sdílí recipe-import (a testy v Node).
import { decodeEntities } from './http.ts'

export type Draft = {
  title: string
  servings: number | null
  prep_minutes: number | null
  ingredient_lines: string[]
  steps: string[]
  image_url: string | null
}

// deno-lint-ignore no-explicit-any
type Node = any

function isRecipe(n: Node): boolean {
  const t = n?.['@type']
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))
}

function findRecipe(n: Node): Node | null {
  if (!n || typeof n !== 'object') return null
  if (Array.isArray(n)) {
    for (const x of n) {
      const r = findRecipe(x)
      if (r) return r
    }
    return null
  }
  if (isRecipe(n)) return n
  if (n['@graph']) return findRecipe(n['@graph'])
  if (n.mainEntity) return findRecipe(n.mainEntity)
  return null
}

function text(s: unknown): string {
  return typeof s === 'string' ? decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : ''
}

/** ISO 8601 doba (PT1H30M) → minuty. */
function minutes(iso: unknown): number | null {
  if (typeof iso !== 'string') return null
  const m = iso.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/)
  if (!m) return null
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return total > 0 ? total : null
}

function servings(y: unknown): number | null {
  const s = Array.isArray(y) ? y.join(' ') : String(y ?? '')
  const n = s.match(/\d+/)?.[0]
  return n ? Math.min(100, Math.max(1, Number(n))) : null
}

function steps(ins: unknown): string[] {
  if (!ins) return []
  if (typeof ins === 'string') {
    return ins
      .split(/\n+|(?<=\.)\s+(?=\d+\.\s)/)
      .map(text)
      .filter(Boolean)
  }
  if (Array.isArray(ins)) {
    return ins.flatMap((s: Node) => {
      if (typeof s === 'string') return [text(s)]
      if (s?.['@type'] === 'HowToSection') return steps(s.itemListElement)
      return [text(s?.text ?? s?.name)]
    }).filter(Boolean)
  }
  if (typeof ins === 'object') return steps((ins as Node).itemListElement)
  return []
}

function image(img: unknown): string | null {
  const first = Array.isArray(img) ? img[0] : img
  const url = typeof first === 'string' ? first : (first as Node)?.url
  return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null
}

export function extract(html: string): Draft | null {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const [, raw] of blocks) {
    let data: Node
    try {
      data = JSON.parse(raw.trim())
    } catch {
      continue
    }
    const r = findRecipe(data)
    if (!r) continue
    const lines = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : r.ingredients ?? [])
      .map(text)
      .filter(Boolean)
    return {
      title: text(r.name) || 'Recept',
      servings: servings(r.recipeYield),
      prep_minutes: minutes(r.totalTime) ?? ((minutes(r.prepTime) ?? 0) + (minutes(r.cookTime) ?? 0) || null),
      ingredient_lines: lines,
      steps: steps(r.recipeInstructions),
      image_url: image(r.image),
    }
  }
  return null
}
