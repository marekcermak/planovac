import { supabase } from '../lib/supabase'
import { fold } from '../lib/text'
import type { Category } from './StockProvider'

export type OffResult = {
  found: boolean
  name?: string
  brand?: string
  quantity?: string
  image_url?: string
  categories?: string[]
}

/** Údaje produktu z Open Food Facts přes Edge Function (s mezipamětí). */
export async function lookupBarcode(barcode: string): Promise<OffResult> {
  const { data, error } = await supabase.functions.invoke<OffResult & { error?: string }>('off-lookup', {
    body: { barcode },
  })
  if (error || !data) throw new Error('Databázi produktů se nepodařilo načíst. Vyplň údaje ručně.')
  if (data.error) throw new Error(data.error)
  return data
}

/** Název pro náš katalog: „Nutella 400 g“ (gramáž pomáhá rozlišit balení). */
export function offProductName(r: OffResult): string {
  const name = r.name ?? ''
  const qty = r.quantity?.replace(/\.0\b/, '').replace(/\s+/g, ' ')
  return qty && !fold(name).includes(fold(qty)) ? `${name} ${qty}` : name
}

/**
 * Odhad kategorie z OFF categories_tags. Pravidla jdou od nejkonkrétnějších.
 * Cíl se hledá podle názvu výchozích kategorií – přejmenovaná kategorie se prostě nenajde.
 */
const RULES: [RegExp, string][] = [
  [/^en:(yogurts|fermented-milk|quark|cottage-cheese|fresh-cheese|dairy-desserts)/, 'Jogurty a tvaroh'],
  [/^en:(cheeses)/, 'Sýry'],
  [/^en:(butters|margarines|fats)/, 'Máslo a tuky'],
  [/^en:(milks|creams|cream|dairy-drinks)/, 'Mléko a smetana'],
  [/^en:(eggs)/, 'Vejce'],
  [/^en:(hams|sausages|prepared-meats|salamis|bacon|cured-meats)/, 'Uzeniny'],
  [/^en:(poultries|chickens|chicken|turkey)/, 'Drůbež'],
  [/^en:(fishes|seafood|fish-and-seafood|tunas|salmons)/, 'Ryby'],
  [/^en:(meats|beef|pork|meat)/, 'Maso'],
  [/^en:(frozen-foods|frozen)/, 'Mražené'],
  [/^en:(canned-foods|canned)/, 'Konzervy'],
  [/^en:(breads)/, 'Chléb'],
  [/^en:(viennoiseries|pastries|bakery|rolls)/, 'Pečivo'],
  [/^en:(fresh-vegetables|vegetables)/, 'Zelenina'],
  [/^en:(fresh-fruits|fruits)$/, 'Ovoce'],
  [/^en:(sauces|condiments|dressings|ketchup|mustards|mayonnaises)/, 'Omáčky a dresinky'],
  [/^en:(spices|herbs-and-spices|salts|seasonings)/, 'Koření'],
  [/^en:(beverages|waters|juices|sodas|beers|wines|coffees|teas)/, 'Nápoje'],
  [/^en:(snacks|sweets|chocolates|biscuits|confectioneries|sweet-spreads|chips)/, 'Sladkosti a snacky'],
  [/^en:(pastas|rices|flours|cereals-and-their-products|legumes|breakfast-cereals|sugars)/, 'Suché potraviny'],
  [/^en:(prepared-meals|meals)/, 'Hotová jídla a zbytky'],
]

export function guessCategory(tags: string[] | undefined, categories: Category[]): string | null {
  if (!tags?.length) return null
  const byName = new Map(categories.map((c) => [fold(c.name), c.id]))
  for (const [re, name] of RULES) {
    if (tags.some((t) => re.test(t))) {
      const id = byName.get(fold(name))
      if (id) return id
    }
  }
  return null
}
