import { fold } from '../lib/text'

/** Jednotky, které ukládáme (stejné jako v AI funkci). */
export const RECIPE_UNITS = [
  'g', 'kg', 'ml', 'l', 'ks', 'lžíce', 'lžička', 'hrnek', 'špetka', 'stroužek',
  'balení', 'plátek', 'hrst', 'svazek', 'kelímek', 'konzerva',
] as const

export type ParsedLine = {
  name: string
  quantity: number | null
  unit: string | null
  note: string | null
  optional: boolean
}

// Zápis jednotky (bez diakritiky, malými) → [jednotka, násobek]
const UNIT_WORDS: Record<string, [string, number]> = {}
function units(words: string[], unit: string, factor = 1) {
  for (const w of words) UNIT_WORDS[w] = [unit, factor]
}
units(['g', 'gr', 'gram', 'gramu', 'gramy'], 'g')
units(['dkg', 'dag', 'deka'], 'g', 10)
units(['kg', 'kila', 'kilo'], 'kg')
units(['ml'], 'ml')
units(['dl', 'decilitr', 'decilitru'], 'ml', 100)
units(['l', 'litr', 'litru', 'litry'], 'l')
units(['ks', 'kus', 'kusy', 'kusu'], 'ks')
units(['lzice', 'lzic', 'pl', 'polevkova', 'polevkove', 'polevkovych'], 'lžíce')
units(['lzicka', 'lzicky', 'lzicek', 'lzicku', 'cl', 'kl', 'kavova', 'kavove', 'kavovych'], 'lžička')
units(['hrnek', 'hrnky', 'hrnku', 'hrnku', 'salek', 'salku', 'salky'], 'hrnek')
units(['spetka', 'spetky', 'spetek', 'spetku'], 'špetka')
units(['strouzek', 'strouzky', 'strouzku', 'strouzku'], 'stroužek')
units(['baleni', 'bal', 'balicek', 'balicku', 'balicky', 'sacek', 'sacku', 'sacky'], 'balení')
units(['platek', 'platky', 'platku'], 'plátek')
units(['hrst', 'hrsti', 'hrstku', 'hrstka'], 'hrst')
units(['svazek', 'svazku', 'svazky', 'svazecek'], 'svazek')
units(['kelimek', 'kelimku', 'kelimky'], 'kelímek')
units(['konzerva', 'konzervy', 'konzerv', 'plechovka', 'plechovky', 'plechovku'], 'konzerva')

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }

function num(s: string): number | null {
  const t = s.replace(',', '.').trim()
  if (FRACTIONS[t] != null) return FRACTIONS[t]
  const mixed = t.match(/^(\d+)\s*([½¼¾⅓⅔⅛])$/)
  if (mixed) return Number(mixed[1]) + FRACTIONS[mixed[2]]
  const frac = t.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

const QTY = String.raw`(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?(?:\s*[½¼¾⅓⅔⅛])?|[½¼¾⅓⅔⅛])`

/**
 * „200 g hladké mouky“ → { quantity 200, unit 'g', name 'hladké mouky' }.
 * Zvládá 1,5 / ½ / 1/2 / 2-3 / 20dkg / „sůl dle chuti“ / „cibule, nakrájená“.
 */
export function parseIngredientLine(raw: string): ParsedLine | null {
  let s = raw.replace(/^[\s•*\-–·]+/, '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  let note: string | null = null
  let optional = false

  // Poznámky v závorce a za čárkou
  const paren = s.match(/\(([^)]*)\)/)
  if (paren) {
    note = paren[1].trim() || null
    s = s.replace(paren[0], ' ').replace(/\s+/g, ' ').trim()
  }
  const f = fold(s)
  if (/(dle|podle) chuti|na ozdobu|nepovinn|podle potreby|dle potreby/.test(f)) {
    optional = /na ozdobu|nepovinn/.test(f)
    const m = s.match(/,?\s*((?:dle|podle) chuti|na ozdobu|\(?nepovinné\)?|podle potřeby|dle potřeby)\s*/i)
    if (m) {
      note = [note, m[1]].filter(Boolean).join(', ')
      s = s.replace(m[0], ' ').trim()
    }
  }

  let quantity: number | null = null
  let unit: string | null = null
  const m = s.match(new RegExp(String.raw`^(?:cca\.?\s*|asi\s*|cca\s*)?${QTY}(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(.*)$`, 'i'))
  if (m) {
    quantity = num(m[1])
    let rest = m[2]
    const word = rest.match(/^([^\s\d.,]+)\.?\s*(.*)$/)
    if (word) {
      const u = UNIT_WORDS[fold(word[1])]
      if (u) {
        unit = u[0]
        if (quantity != null) quantity = Math.round(quantity * u[1] * 1000) / 1000
        rest = word[2]
      }
    }
    if (!unit && quantity != null) unit = 'ks'
    s = rest.trim()
  } else {
    // „špetka soli“, „stroužek česneku“ bez čísla
    const word = s.match(/^([^\s\d.,]+)\.?\s+(.*)$/)
    const u = word && UNIT_WORDS[fold(word[1])]
    if (word && u && !['g', 'kg', 'ml', 'l', 'ks'].includes(u[0])) {
      unit = u[0]
      quantity = 1
      s = word[2]
    }
  }

  // „cibule, nakrájená na kostičky“ → poznámka
  const comma = s.indexOf(',')
  if (comma > 0) {
    note = [s.slice(comma + 1).trim(), note].filter(Boolean).join(', ') || null
    s = s.slice(0, comma).trim()
  }
  s = s.replace(/^(z|ze|of)\s+/i, '').trim()
  if (!s) return null
  return { name: s.slice(0, 120), quantity, unit, note: note?.slice(0, 200) ?? null, optional }
}

// ---------------------------------------------------------------------------
// Párování na suroviny
// ---------------------------------------------------------------------------

/** Kmen slova pro shodu se skloňovanými tvary; krátká slova (≤ 3) jen přesně („sůl“, „med“). */
function stem(w: string): { s: string; exact: boolean } {
  if (w.length <= 3) return { s: w, exact: true }
  if (w.length === 4) return { s: w.slice(0, 3), exact: false }
  return { s: w.slice(0, Math.max(4, w.length - 2)), exact: false }
}

function words(s: string): string[] {
  return fold(s).split(/[^a-z0-9]+/).filter(Boolean)
}

type Candidate = { id: string; stems: { s: string; exact: boolean }[]; weight: number; exact: string }

export type IngredientIndex = { match: (name: string) => string | null }

/**
 * Index surovin + aliasů. Shoda = každé slovo kandidáta (zkrácené na kmen) je začátkem
 * některého slova v textu; vyhrává nejdelší shoda („hladké mouky“ → hladká mouka, ne mouka).
 */
export function buildIngredientIndex(
  ingredients: { id: string; name: string }[],
  aliases: { ingredient_id: string; alias: string }[],
): IngredientIndex {
  const cands: Candidate[] = []
  const add = (id: string, term: string, bonus: number) => {
    const ws = words(term)
    if (ws.length === 0) return
    cands.push({ id, stems: ws.map(stem), weight: ws.reduce((a, w) => a + w.length, 0) + bonus, exact: ws.join(' ') })
  }
  for (const i of ingredients) add(i.id, i.name, 0.5)
  for (const a of aliases) add(a.ingredient_id, a.alias, 0)

  return {
    match(name) {
      const tokens = words(name)
      if (tokens.length === 0) return null
      const joined = tokens.join(' ')
      let best: Candidate | null = null
      let bestScore = 0
      for (const c of cands) {
        if (c.exact === joined) return c.id
        const ok = c.stems.every(({ s, exact }) => tokens.some((t) => (exact ? t === s : t.startsWith(s))))
        if (ok && c.weight > bestScore) {
          best = c
          bestScore = c.weight
        }
      }
      return best?.id ?? null
    },
  }
}

/**
 * Text receptu bez AI: první řádek bez čísla = název, řádky s množstvím = suroviny,
 * ostatní = postup. Sekce „Suroviny:“ / „Postup:“ přepínají režim.
 */
export function parseRecipeText(text: string): { title: string; ingredients: ParsedLine[]; steps: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let title = ''
  const ingredients: ParsedLine[] = []
  const steps: string[] = []
  let mode: 'auto' | 'ing' | 'steps' = 'auto'
  for (const [i, line] of lines.entries()) {
    const f = fold(line).replace(/[:\s]+$/, '')
    if (/^(suroviny|ingredience|potrebujeme|budete potrebovat)$/.test(f)) {
      mode = 'ing'
      continue
    }
    if (/^(postup|priprava|navod)$/.test(f)) {
      mode = 'steps'
      continue
    }
    if (i === 0 && !/\d/.test(line) && line.length < 80) {
      title = line
      continue
    }
    const looksLikeIngredient = line.length < 70 && /^[\s•*\-–]*(\d|[½¼¾⅓⅔⅛]|špetk|stroužek|hrst|svazek)/i.test(line)
    if (mode === 'ing' || (mode === 'auto' && looksLikeIngredient)) {
      const p = parseIngredientLine(line)
      if (p) ingredients.push(p)
    } else {
      steps.push(line.replace(/^\d+[.)]\s*/, ''))
    }
  }
  return { title, ingredients, steps }
}
