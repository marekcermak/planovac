import { ChefHat, ChevronLeft, Clock, ExternalLink, Minus, Pencil, Plus, ShoppingCart, Star, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Sheet } from '../../components/Sheet'
import { useToast } from '../../components/Toast'
import { Button, Card, ErrorText } from '../../components/ui'
import { RECIPE_BUCKET, useSignedUrls } from '../../lib/images'
import { errorMessage, supabase } from '../../lib/supabase'
import { STATUS_BADGE, STATUS_LABEL, useAvailability } from '../../kitchen/availability'
import { useKitchen, type RecipeIngredient } from '../../kitchen/KitchenProvider'
import { CookSheet } from '../../kitchen/CookSheet'
import { splitSteps } from '../../kitchen/RecipeEditor'
import { AddFromRecipeSheet } from '../../shopping/AddFromRecipeSheet'
import { PinButton } from '../../display/PinButton'

const cookedFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Prague' })

const qtyFmt = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 })

export function RecipePage() {
  const { id } = useParams()
  const { recipeById, loading } = useKitchen()
  const recipe = id ? recipeById.get(id) : undefined
  if (!recipe) {
    return (
      <div>
        <BackToList />
        <p className="text-neutral-500">{loading ? 'Načítám…' : 'Recept nenalezen.'}</p>
      </div>
    )
  }
  return <RecipeDetail key={recipe.id} recipeId={recipe.id} />
}

function BackToList() {
  return (
    <Link to="/kucharka" className="mb-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-neutral-500 lg:hidden">
      <ChevronLeft className="size-4" /> Kuchařka
    </Link>
  )
}

function RecipeDetail({ recipeId }: { recipeId: string }) {
  const { recipeById, ingredientsOf, categoriesOf, ingredientById, upsertLocal, removeLocal, lastCooked } = useKitchen()
  const availability = useAvailability()
  const navigate = useNavigate()
  const toast = useToast()
  const recipe = recipeById.get(recipeId)!
  const rows = ingredientsOf(recipeId)
  const [servings, setServings] = useState(recipe.servings ?? 0)
  const [statusOf, setStatusOf] = useState<RecipeIngredient | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sheet, setSheet] = useState<'cook' | 'shop' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const urls = useSignedUrls(recipe.photo_paths)
  const hero = (recipe.photo_paths[0] && urls[recipe.photo_paths[0]]) || recipe.image_url
  const factor = recipe.servings && servings ? servings / recipe.servings : 1
  const steps = splitSteps(recipe.steps)
  const summary = availability.summary(recipeId)
  const cooked = lastCooked(recipeId)

  async function rate(n: number) {
    const { data, error } = await supabase
      .from('recipes')
      .update({ rating: recipe.rating === n ? null : n })
      .eq('id', recipe.id)
      .select()
      .single()
    if (error) return setError(errorMessage(error))
    upsertLocal('recipes', data)
  }

  async function remove() {
    if (recipe.photo_paths.length) await supabase.storage.from(RECIPE_BUCKET).remove(recipe.photo_paths)
    const { error } = await supabase.from('recipes').delete().eq('id', recipe.id)
    if (error) return setError(errorMessage(error))
    removeLocal('recipes', recipe.id)
    toast(`Recept „${recipe.title}“ smazán`)
    navigate('/kucharka', { replace: true })
  }

  return (
    <article className="pb-6">
      <BackToList />
      {hero && <img src={hero} alt="" className="mb-4 aspect-[16/9] w-full rounded-2xl object-cover" />}

      <div className="mb-3 flex items-start gap-3">
        <h1 className="flex-1 text-2xl font-bold tracking-tight">{recipe.title}</h1>
        <Link
          to={`/kucharka/${recipe.id}/upravit`}
          aria-label="Upravit recept"
          className="flex size-11 items-center justify-center rounded-full ring-1 ring-neutral-300 dark:ring-neutral-700"
        >
          <Pencil className="size-5" />
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-600 dark:text-neutral-400">
        {categoriesOf(recipe.id).map((c) => (
          <span key={c.id} className="rounded-full bg-neutral-100 px-2.5 py-0.5 dark:bg-neutral-800">
            {c.icon} {c.name}
          </span>
        ))}
        {recipe.prep_minutes ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" /> {recipe.prep_minutes} min
          </span>
        ) : null}
        <span className="inline-flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} aria-label={`Hodnocení ${n}`} onClick={() => void rate(n)} className="p-0.5">
              <Star className={`size-5 ${recipe.rating && n <= recipe.rating ? 'fill-amber-400 text-amber-400' : 'text-neutral-300 dark:text-neutral-600'}`} />
            </button>
          ))}
        </span>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button onClick={() => setSheet('cook')}>
          <ChefHat className="size-5" /> Uvařeno
        </Button>
        {rows.length > 0 && (
          <Button variant="secondary" onClick={() => setSheet('shop')}>
            <ShoppingCart className="size-5" />
            {summary.missing.length ? `Chybějící do nákupu (${summary.missing.length})` : 'Do nákupu'}
          </Button>
        )}
        <PinButton kind="recipe" refId={recipe.id} text={`Večeře: ${recipe.title}`} />
        {cooked && <span className="text-sm text-neutral-500">Naposledy vařeno {cookedFmt.format(new Date(cooked))}</span>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card
          title={
            <span className="flex items-center gap-2">
              <span className="flex-1">Suroviny</span>
              {recipe.servings ? (
                <span className="flex items-center gap-1 text-sm font-normal">
                  <button aria-label="Méně porcí" onClick={() => setServings((s) => Math.max(1, s - 1))} className="flex size-8 items-center justify-center rounded-full ring-1 ring-neutral-300 dark:ring-neutral-700">
                    <Minus className="size-4" />
                  </button>
                  <span className="inline-flex min-w-14 items-center justify-center gap-1">
                    <Users className="size-4" /> {servings}
                  </span>
                  <button aria-label="Více porcí" onClick={() => setServings((s) => s + 1)} className="flex size-8 items-center justify-center rounded-full ring-1 ring-neutral-300 dark:ring-neutral-700">
                    <Plus className="size-4" />
                  </button>
                </span>
              ) : null}
            </span>
          }
        >
          {rows.length === 0 ? (
            <p className="text-neutral-500">Bez surovin.</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-neutral-500">
                {summary.canCook
                  ? 'Všechno potřebné máš doma.'
                  : `Chybí: ${summary.missing.map((m) => m.name).join(', ')}`}
              </p>
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {rows.map((ri) => {
                  const st = availability.status(ri)
                  return (
                    <li key={ri.id} className="flex min-h-11 items-center gap-2 py-1.5">
                      <span className="w-20 shrink-0 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                        {ri.quantity != null ? qtyFmt.format(ri.quantity * factor) : ''} {ri.unit ?? ''}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={ri.optional ? 'text-neutral-500' : ''}>{ri.name}</span>
                        {ri.note && <span className="text-sm text-neutral-500">, {ri.note}</span>}
                      </span>
                      <button
                        onClick={() => setStatusOf(ri)}
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[st]}`}
                      >
                        {STATUS_LABEL[st]}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Postup">
            {steps.length === 0 ? (
              <p className="text-neutral-500">Bez postupu.</p>
            ) : (
              <ol className="space-y-3">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800 dark:bg-brand-800/30 dark:text-brand-100">
                      {i + 1}
                    </span>
                    <p className="pt-0.5 whitespace-pre-line">{s}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          {recipe.notes && (
            <Card title="Poznámky">
              <p className="whitespace-pre-line">{recipe.notes}</p>
            </Card>
          )}
          {recipe.photo_paths.length > 1 && (
            <div className="grid grid-cols-3 gap-2">
              {recipe.photo_paths.slice(1).map((p) =>
                urls[p] ? (
                  <a key={p} href={urls[p]} target="_blank" rel="noreferrer">
                    <img src={urls[p]} alt="" className="aspect-square w-full rounded-xl object-cover" />
                  </a>
                ) : null,
              )}
            </div>
          )}
          {recipe.source_url && (
            <a href={recipe.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 dark:text-brand-500">
              <ExternalLink className="size-4" /> Původní recept
            </a>
          )}
        </div>
      </div>

      <ErrorText>{error}</ErrorText>
      <div className="mt-8">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-red-50 p-3 text-sm dark:bg-red-950">
            <span className="flex-1">Opravdu smazat recept i s fotkami?</span>
            <Button variant="danger" onClick={() => void remove()}>
              Smazat
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Ne
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-5" /> Smazat recept
          </Button>
        )}
      </div>

      <CookSheet
        recipeId={recipeId}
        factor={factor}
        servings={recipe.servings ? servings : null}
        open={sheet === 'cook'}
        onClose={() => setSheet(null)}
      />
      <AddFromRecipeSheet recipeId={recipeId} factor={factor} open={sheet === 'shop'} onClose={() => setSheet(null)} />
      <IngredientStatusSheet
        row={statusOf}
        onClose={() => setStatusOf(null)}
        ingredientName={statusOf?.ingredient_id ? ingredientById.get(statusOf.ingredient_id)?.name : undefined}
      />
    </article>
  )
}

/** Ťuknutí na stav suroviny: co je ve skladu, a přepínač „mám vždy doma“. */
function IngredientStatusSheet({
  row,
  onClose,
  ingredientName,
}: {
  row: RecipeIngredient | null
  onClose: () => void
  ingredientName?: string
}) {
  const { ingredientById, upsertLocal } = useKitchen()
  const availability = useAvailability()
  const ingredient = row?.ingredient_id ? ingredientById.get(row.ingredient_id) : undefined
  const stock = ingredient ? availability.stockFor(ingredient.id) : []

  async function toggleStaple() {
    if (!ingredient) return
    const { data } = await supabase
      .from('ingredients')
      .update({ is_staple: !ingredient.is_staple })
      .eq('id', ingredient.id)
      .select()
      .single()
    if (data) upsertLocal('ingredients', data)
  }

  return (
    <Sheet open={row !== null} onClose={onClose} title={ingredientName ?? row?.name ?? ''}>
      {row && !ingredient && (
        <p className="text-neutral-600 dark:text-neutral-400">
          Surovina „{row.name}“ není spárovaná, takže nevím, jestli ji máš. Spáruj ji v úpravě receptu.
        </p>
      )}
      {ingredient && (
        <div className="space-y-4">
          {stock.length > 0 ? (
            <p>Ve skladu: {stock.length} {stock.length === 1 ? 'kus' : 'kusy'}.</p>
          ) : (
            <p className="text-neutral-600 dark:text-neutral-400">
              Ve skladu není žádný produkt spárovaný se surovinou „{ingredient.name}“. Produkt spáruješ v Nastavení → Produkty.
            </p>
          )}
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" className="size-5 accent-brand-700" checked={ingredient.is_staple} onChange={() => void toggleStaple()} />
            <span>
              Mám vždy doma <span className="text-sm text-neutral-500">(sůl, koření… nepočítá se jako chybějící)</span>
            </span>
          </label>
        </div>
      )}
    </Sheet>
  )
}
