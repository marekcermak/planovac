import { BookOpen, ShoppingCart, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Button, Chip, ErrorText } from '../components/ui'
import { useAvailability } from '../kitchen/availability'
import { useKitchen } from '../kitchen/KitchenProvider'
import { fold } from '../lib/text'
import { AddFromRecipeSheet } from '../shopping/AddFromRecipeSheet'
import { addDays, todayIso } from '../stock/expiry'
import { useMeals } from './MealsProvider'

const dayFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' })

export function dayLabel(date: string): string {
  const today = todayIso()
  if (date === today) return 'Dnes'
  if (date === addDays(today, 1)) return 'Zítra'
  const s = dayFmt.format(new Date(`${date}T12:00:00Z`))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Úprava jídla na den: volný text nebo recept z kuchařky (pak jde chybějící poslat do nákupu). */
export function MealSheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  return (
    <Sheet open={date !== null} onClose={onClose} title={date ? `Jídlo – ${dayLabel(date).toLowerCase()}` : ''}>
      {date && <MealForm key={date} date={date} onDone={onClose} />}
    </Sheet>
  )
}

function MealForm({ date, onDone }: { date: string; onDone: () => void }) {
  const { mealOn, setMeal } = useMeals()
  const { recipes, recipeById } = useKitchen()
  const availability = useAvailability()
  const toast = useToast()
  const meal = mealOn(date)
  const [text, setText] = useState(meal?.text ?? '')
  const [recipeId, setRecipeId] = useState<string | null>(meal?.recipe_id ?? null)
  const [shop, setShop] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recipe = recipeId ? recipeById.get(recipeId) : undefined
  const q = fold(text.trim())
  const suggestions = q && !recipe ? recipes.filter((r) => fold(r.title).includes(q)).slice(0, 5) : []
  const missing = recipe ? availability.summary(recipe.id).missing.length : 0

  async function save(t = text, rid = recipeId) {
    setBusy(true)
    setError(null)
    try {
      await setMeal(date, t, rid)
      toast(t.trim() ? `${dayLabel(date)}: ${t.trim()}` : 'Smazáno')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se uložit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="relative">
        <input
          autoFocus
          value={text}
          maxLength={80}
          onChange={(e) => {
            setText(e.target.value)
            if (recipe && e.target.value !== recipe.title) setRecipeId(null)
          }}
          placeholder="Co bude? (např. kuře na paprice)"
          className="block min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 pr-10 text-base outline-none focus:border-brand-600 dark:border-neutral-700 dark:bg-neutral-900"
        />
        {text && (
          <button
            type="button"
            aria-label="Vymazat"
            onClick={() => {
              setText('')
              setRecipeId(null)
            }}
            className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-neutral-400"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="w-full text-sm text-neutral-500">Z kuchařky:</span>
          {suggestions.map((r) => (
            <Chip
              key={r.id}
              active={false}
              onClick={() => {
                setText(r.title)
                setRecipeId(r.id)
              }}
            >
              <BookOpen className="size-4" /> {r.title}
            </Chip>
          ))}
        </div>
      )}

      {recipe && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 p-2 text-sm dark:bg-neutral-800/60">
          <Link to={`/kucharka/${recipe.id}`} className="inline-flex items-center gap-1 font-medium text-brand-700 dark:text-brand-500">
            <BookOpen className="size-4" /> Recept
          </Link>
          <span className="text-neutral-500">{missing ? `chybí ${missing}` : 'máš všechno'}</span>
          {missing > 0 && (
            <Button type="button" variant="ghost" className="min-h-9 text-sm" onClick={() => setShop(true)}>
              <ShoppingCart className="size-4" /> Do nákupu
            </Button>
          )}
        </div>
      )}

      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={busy || (!text.trim() && !meal)}>
          {text.trim() ? 'Uložit' : 'Smazat'}
        </Button>
      </div>
      <p className="text-xs text-neutral-500">Dnešní a zítřejší jídlo se samo ukáže na displeji (jidlo_dnes, jidlo_zitra).</p>
      {recipe && <AddFromRecipeSheet recipeId={recipe.id} factor={1} open={shop} onClose={() => setShop(false)} />}
    </form>
  )
}
