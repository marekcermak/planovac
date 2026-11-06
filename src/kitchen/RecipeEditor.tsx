import { Camera, Check, Plus, Star, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '../components/Toast'
import { Button, Chip, ErrorText, Field } from '../components/ui'
import { useHousehold } from '../household/HouseholdProvider'
import { RECIPE_BUCKET, shrinkImage, useSignedUrls } from '../lib/images'
import { errorMessage, supabase } from '../lib/supabase'
import { useKitchen, type Recipe } from './KitchenProvider'
import { parseIngredientLine, RECIPE_UNITS, type ParsedLine } from './parse'

export type IngredientRow = {
  key: string
  name: string
  quantity: string
  unit: string
  note: string
  optional: boolean
  ingredientId: string | null
}

export type RecipeDraft = {
  title: string
  servings: string
  prepMinutes: string
  steps: string
  notes: string
  tags: string[]
  categoryIds: string[]
  rating: number | null
  sourceType: Recipe['source_type']
  sourceUrl: string
  imageUrl: string
  ingredients: IngredientRow[]
  photoPaths: string[]
  newPhotos: Blob[]
}

let seq = 0
export const rowKey = () => `r${++seq}`

export function emptyDraft(): RecipeDraft {
  return {
    title: '',
    servings: '',
    prepMinutes: '',
    steps: '',
    notes: '',
    tags: [],
    categoryIds: [],
    rating: null,
    sourceType: 'manual',
    sourceUrl: '',
    imageUrl: '',
    ingredients: [],
    photoPaths: [],
    newPhotos: [],
  }
}

export function rowFromParsed(p: ParsedLine, match: (name: string) => string | null): IngredientRow {
  return {
    key: rowKey(),
    name: p.name,
    quantity: p.quantity != null ? String(p.quantity).replace('.', ',') : '',
    unit: p.unit ?? '',
    note: p.note ?? '',
    optional: p.optional,
    ingredientId: match(p.name),
  }
}

/** Kroky postupu: oddělené prázdným řádkem (nebo každý řádek zvlášť). */
export function splitSteps(steps: string): string[] {
  const parts = steps.includes('\n\n') ? steps.split(/\n\s*\n/) : steps.split('\n')
  return parts.map((s) => s.trim()).filter(Boolean)
}

/** Editor receptu: nový (i z fotky/odkazu) nebo úprava. Po uložení přejde na detail. */
export function RecipeEditor({ initial, recipeId }: { initial: RecipeDraft; recipeId?: string }) {
  const { household } = useHousehold()
  const { categories, ingredients, ingredientById, index, upsertLocal, reload } = useKitchen()
  const navigate = useNavigate()
  const toast = useToast()
  const [d, setD] = useState<RecipeDraft>(initial)
  const [bulk, setBulk] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const urls = useSignedUrls(d.photoPaths)
  const [previews] = useState(() => new Map<Blob, string>())
  const preview = (b: Blob) => {
    if (!previews.has(b)) previews.set(b, URL.createObjectURL(b))
    return previews.get(b)!
  }

  const set = <K extends keyof RecipeDraft>(k: K, v: RecipeDraft[K]) => setD((x) => ({ ...x, [k]: v }))
  const setRow = (key: string, patch: Partial<IngredientRow>) =>
    setD((x) => ({ ...x, ingredients: x.ingredients.map((r) => (r.key === key ? { ...r, ...patch } : r)) }))

  function addBulk() {
    const rows = bulk
      .split(/\r?\n/)
      .map(parseIngredientLine)
      .filter((p): p is ParsedLine => !!p)
      .map((p) => rowFromParsed(p, index.match))
    setD((x) => ({ ...x, ingredients: [...x.ingredients, ...rows] }))
    setBulk('')
  }

  async function createIngredient(row: IngredientRow) {
    if (!household) return
    const name = row.name.trim().toLowerCase()
    const { data, error } = await supabase
      .from('ingredients')
      .insert({ household_id: household.id, name })
      .select()
      .single()
    if (error) {
      // Už existuje se stejným názvem → použít ji.
      const existing = ingredients.find((i) => i.name === name)
      if (existing) return setRow(row.key, { ingredientId: existing.id })
      return setError(errorMessage(error))
    }
    upsertLocal('ingredients', data)
    setRow(row.key, { ingredientId: data.id })
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    const blobs = await Promise.all([...files].map((f) => shrinkImage(f)))
    setD((x) => ({ ...x, newPhotos: [...x.newPhotos, ...blobs] }))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!household) return
    setBusy(true)
    setError(null)
    try {
      const num = (s: string) => {
        const n = Number(s.replace(',', '.'))
        return s.trim() && Number.isFinite(n) && n > 0 ? n : null
      }
      const row = {
        title: d.title.trim(),
        servings: num(d.servings) ? Math.round(num(d.servings)!) : null,
        prep_minutes: num(d.prepMinutes) ? Math.round(num(d.prepMinutes)!) : null,
        steps: splitSteps(d.steps).join('\n\n'),
        notes: d.notes.trim(),
        tags: d.tags,
        rating: d.rating,
        source_type: d.sourceType,
        source_url: d.sourceUrl.trim() || null,
        image_url: d.imageUrl.trim() || null,
      }
      const res = recipeId
        ? await supabase.from('recipes').update(row).eq('id', recipeId).select().single()
        : await supabase.from('recipes').insert({ ...row, household_id: household.id }).select().single()
      if (res.error) throw res.error
      const recipe = res.data
      const id = recipe.id

      // Nové fotky do Storage
      const uploaded: string[] = []
      for (const blob of d.newPhotos) {
        const path = `${household.id}/${id}/${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from(RECIPE_BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        uploaded.push(path)
      }
      const photoPaths = [...d.photoPaths, ...uploaded]
      // Smazané fotky (jen u úpravy)
      const removed = (initial.photoPaths ?? []).filter((p) => !d.photoPaths.includes(p))
      if (removed.length) await supabase.storage.from(RECIPE_BUCKET).remove(removed)
      if (uploaded.length || removed.length) {
        const { error } = await supabase.from('recipes').update({ photo_paths: photoPaths }).eq('id', id)
        if (error) throw error
      }

      // Suroviny a kapitoly: smazat a vložit znovu (jednoduché a konzistentní)
      const del1 = await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)
      if (del1.error) throw del1.error
      const ingRows = d.ingredients
        .filter((r) => r.name.trim())
        .map((r, i) => ({
          household_id: household.id,
          recipe_id: id,
          sort: i,
          name: r.name.trim(),
          ingredient_id: r.ingredientId,
          quantity: num(r.quantity),
          unit: r.unit || null,
          optional: r.optional,
          note: r.note.trim() || null,
        }))
      if (ingRows.length) {
        const ins = await supabase.from('recipe_ingredients').insert(ingRows)
        if (ins.error) throw ins.error
      }
      const del2 = await supabase.from('recipe_category_links').delete().eq('recipe_id', id)
      if (del2.error) throw del2.error
      if (d.categoryIds.length) {
        const ins = await supabase
          .from('recipe_category_links')
          .insert(d.categoryIds.map((c) => ({ household_id: household.id, recipe_id: id, category_id: c })))
        if (ins.error) throw ins.error
      }
      await reload()
      toast(recipeId ? 'Recept uložen' : `Recept „${recipe.title}“ je v kuchařce`)
      navigate(`/kucharka/${id}`, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const unmatched = d.ingredients.filter((r) => r.name.trim() && !r.ingredientId).length

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Levý sloupec: základ + suroviny */}
        <div className="space-y-4">
          <Field label="Název" required maxLength={160} value={d.title} onChange={(e) => set('title', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Porce" inputMode="numeric" value={d.servings} onChange={(e) => set('servings', e.target.value.replace(/\D/g, ''))} />
            <Field label="Čas (minuty)" inputMode="numeric" value={d.prepMinutes} onChange={(e) => set('prepMinutes', e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Kapitoly</span>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = d.categoryIds.includes(c.id)
                return (
                  <Chip
                    key={c.id}
                    active={on}
                    onClick={() =>
                      set('categoryIds', on ? d.categoryIds.filter((x) => x !== c.id) : [...d.categoryIds, c.id])
                    }
                  >
                    {c.icon} {c.name}
                  </Chip>
                )
              })}
            </div>
          </div>

          <section>
            <h2 className="mb-2 flex items-baseline gap-2 font-semibold">
              Suroviny
              {unmatched > 0 && (
                <span className="text-xs font-normal text-orange-700 dark:text-orange-400">{unmatched} nespárováno se skladem</span>
              )}
            </h2>
            <ul className="space-y-2">
              {d.ingredients.map((r) => (
                <li key={r.key} className="rounded-xl bg-white p-2 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
                  <div className="flex gap-1.5">
                    <input
                      aria-label="Množství"
                      inputMode="decimal"
                      value={r.quantity}
                      onChange={(e) => setRow(r.key, { quantity: e.target.value })}
                      className="min-h-11 w-16 rounded-lg border border-neutral-300 bg-transparent px-2 dark:border-neutral-700"
                    />
                    <select
                      aria-label="Jednotka"
                      value={r.unit}
                      onChange={(e) => setRow(r.key, { unit: e.target.value })}
                      className="min-h-11 w-20 rounded-lg border border-neutral-300 bg-transparent px-1 dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      <option value="">–</option>
                      {RECIPE_UNITS.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                    <input
                      aria-label="Surovina"
                      value={r.name}
                      onChange={(e) => setRow(r.key, { name: e.target.value })}
                      onBlur={() => !r.ingredientId && setRow(r.key, { ingredientId: index.match(r.name) })}
                      className="min-h-11 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-2 dark:border-neutral-700"
                    />
                    <button
                      type="button"
                      aria-label="Odebrat surovinu"
                      onClick={() => set('ingredients', d.ingredients.filter((x) => x.key !== r.key))}
                      className="flex size-11 shrink-0 items-center justify-center text-neutral-400"
                    >
                      <X className="size-5" />
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                    {r.ingredientId ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-green-800 dark:bg-green-950 dark:text-green-300">
                        <Check className="size-3.5" /> {ingredientById.get(r.ingredientId)?.name}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void createIngredient(r)}
                        className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-800 dark:bg-orange-950 dark:text-orange-300"
                      >
                        + založit „{r.name.trim().toLowerCase()}“
                      </button>
                    )}
                    <select
                      aria-label="Spárovat se surovinou"
                      value={r.ingredientId ?? ''}
                      onChange={(e) => setRow(r.key, { ingredientId: e.target.value || null })}
                      className="min-h-8 max-w-40 rounded-lg bg-neutral-100 px-1 text-xs dark:bg-neutral-800"
                    >
                      <option value="">jiná surovina…</option>
                      {ingredients.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Poznámka"
                      placeholder="poznámka"
                      value={r.note}
                      onChange={(e) => setRow(r.key, { note: e.target.value })}
                      className="min-h-8 min-w-0 flex-1 rounded-lg bg-neutral-100 px-2 text-xs dark:bg-neutral-800"
                    />
                    <label className="flex items-center gap-1 text-xs text-neutral-500">
                      <input type="checkbox" checked={r.optional} onChange={(e) => setRow(r.key, { optional: e.target.checked })} />
                      nepovinné
                    </label>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-2">
              <textarea
                rows={3}
                placeholder={'Přidat suroviny – každou na řádek:\n200 g hladké mouky\n2 vejce'}
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                className="block w-full rounded-xl border border-neutral-300 bg-white p-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
              />
              <Button type="button" variant="secondary" disabled={!bulk.trim()} onClick={addBulk}>
                <Plus className="size-5" /> Přidat suroviny
              </Button>
            </div>
          </section>
        </div>

        {/* Pravý sloupec: postup, poznámky, fotky */}
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Postup <span className="font-normal text-neutral-500">(kroky odděl prázdným řádkem)</span>
            </span>
            <textarea
              rows={12}
              value={d.steps}
              onChange={(e) => set('steps', e.target.value)}
              className="block w-full rounded-xl border border-neutral-300 bg-white p-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Poznámky</span>
            <textarea
              rows={4}
              placeholder="Co příště jinak, čím nahradit, komu chutnalo…"
              value={d.notes}
              onChange={(e) => set('notes', e.target.value)}
              className="block w-full rounded-xl border border-neutral-300 bg-white p-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Hodnocení</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} z 5`}
                  onClick={() => set('rating', d.rating === n ? null : n)}
                  className="p-1"
                >
                  <Star className={`size-7 ${d.rating && n <= d.rating ? 'fill-amber-400 text-amber-400' : 'text-neutral-300 dark:text-neutral-600'}`} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Fotky</span>
            <div className="flex flex-wrap gap-2">
              {d.photoPaths.map((p) => (
                <div key={p} className="relative">
                  {urls[p] ? <img src={urls[p]} alt="" className="size-24 rounded-xl object-cover" /> : <div className="size-24 rounded-xl bg-neutral-200 dark:bg-neutral-800" />}
                  <button
                    type="button"
                    aria-label="Odebrat fotku"
                    onClick={() => set('photoPaths', d.photoPaths.filter((x) => x !== p))}
                    className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-neutral-900 text-white"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              {d.newPhotos.map((b, i) => (
                <div key={i} className="relative">
                  <img src={preview(b)} alt="" className="size-24 rounded-xl object-cover" />
                  <button
                    type="button"
                    aria-label="Odebrat fotku"
                    onClick={() => set('newPhotos', d.newPhotos.filter((x) => x !== b))}
                    className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-neutral-900 text-white"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex size-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-neutral-300 text-sm text-neutral-500 dark:border-neutral-700"
              >
                <Camera className="size-6" /> Přidat
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  void addPhotos(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
          <Field label="Zdroj (odkaz, nepovinné)" type="url" value={d.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} />
        </div>
      </div>

      <ErrorText>{error}</ErrorText>
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex gap-2 rounded-2xl bg-neutral-50/90 py-2 backdrop-blur lg:bottom-2 dark:bg-neutral-950/90">
        <Button type="submit" className="flex-1" disabled={busy || !d.title.trim()}>
          {busy ? 'Ukládám…' : 'Uložit recept'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
          Zrušit
        </Button>
      </div>
    </form>
  )
}

/** Recept z DB → koncept pro editor. */
export function draftFromRecipe(
  recipe: Recipe,
  rows: { name: string; quantity: number | null; unit: string | null; note: string | null; optional: boolean; ingredient_id: string | null }[],
  categoryIds: string[],
): RecipeDraft {
  return {
    title: recipe.title,
    servings: recipe.servings?.toString() ?? '',
    prepMinutes: recipe.prep_minutes?.toString() ?? '',
    steps: recipe.steps,
    notes: recipe.notes,
    tags: recipe.tags,
    categoryIds,
    rating: recipe.rating,
    sourceType: recipe.source_type,
    sourceUrl: recipe.source_url ?? '',
    imageUrl: recipe.image_url ?? '',
    ingredients: rows.map((r) => ({
      key: rowKey(),
      name: r.name,
      quantity: r.quantity != null ? String(r.quantity).replace('.', ',') : '',
      unit: r.unit ?? '',
      note: r.note ?? '',
      optional: r.optional,
      ingredientId: r.ingredient_id,
    })),
    photoPaths: recipe.photo_paths,
    newPhotos: [],
  }
}

