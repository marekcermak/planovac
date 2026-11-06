import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Sheet } from '../components/Sheet'
import { useToast } from '../components/Toast'
import { Button, Card } from '../components/ui'
import { addDays, todayIso } from '../stock/expiry'
import { dayLabel, MealSheet } from './MealSheet'
import { useMeals } from './MealsProvider'

/** Dnes: jídlo dnes a zítra, ťuknutím upravit. */
export function MealsCard() {
  const { mealOn } = useMeals()
  const [edit, setEdit] = useState<string | null>(null)
  const today = todayIso()
  return (
    <Card
      title={
        <span className="flex items-baseline gap-2">
          <span className="flex-1">Jídlo</span>
          <Link to="/planovac/jidlo" className="text-sm font-normal text-brand-700 dark:text-brand-500">
            Jídelníček →
          </Link>
        </span>
      }
    >
      <ul className="-my-1 divide-y divide-neutral-100 dark:divide-neutral-800">
        {[today, addDays(today, 1)].map((d) => {
          const meal = mealOn(d)
          return (
            <li key={d}>
              <button onClick={() => setEdit(d)} className="flex min-h-12 w-full items-center gap-3 text-left">
                <span className="w-14 shrink-0 text-sm text-neutral-500">{dayLabel(d)}</span>
                {meal ? <span className="font-medium">{meal.text}</span> : <span className="text-neutral-400">+ naplánovat</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <MealSheet date={edit} onClose={() => setEdit(null)} />
    </Card>
  )
}

/** U receptu: „Naplánovat“ na některý z příštích 7 dní. */
export function PlanRecipeButton({ recipeId, title }: { recipeId: string; title: string }) {
  const { mealOn, setMeal } = useMeals()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const today = todayIso()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))

  async function plan(date: string) {
    try {
      await setMeal(date, title, recipeId)
      toast(`${dayLabel(date)}: ${title}`)
      setOpen(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Nepodařilo se uložit.', 'error')
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <CalendarPlus className="size-5" /> Naplánovat
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Na který den?">
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {days.map((d) => {
            const meal = mealOn(d)
            return (
              <li key={d}>
                <button onClick={() => void plan(d)} className="flex min-h-12 w-full items-center gap-3 text-left">
                  <span className="w-36 shrink-0 font-medium">{dayLabel(d)}</span>
                  <span className="truncate text-sm text-neutral-500">{meal ? `nahradí: ${meal.text}` : ''}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Sheet>
    </>
  )
}
