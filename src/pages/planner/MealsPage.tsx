import { BookOpen, Plus } from 'lucide-react'
import { useState } from 'react'
import { dayLabel, MealSheet } from '../../meals/MealSheet'
import { useMeals } from '../../meals/MealsProvider'
import { addDays, todayIso } from '../../stock/expiry'
import { weekStart } from '../../habits/schedule'

/** Plánovač → Jídlo: jídelníček na tento a příští týden, jedno jídlo na den. */
export function MealsPage() {
  const { mealOn } = useMeals()
  const [edit, setEdit] = useState<string | null>(null)
  const today = todayIso()
  const start = weekStart(today)
  const weeks = [0, 1].map((w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)))

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">Jídelníček vidíte oba. Dnešek a zítřek jdou samy na displej.</p>
      {weeks.map((days, w) => (
        <section key={w}>
          <h2 className="mb-1.5 text-sm font-semibold text-neutral-500">{w === 0 ? 'Tento týden' : 'Příští týden'}</h2>
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
            {days.map((d) => {
              const meal = mealOn(d)
              const past = d < today
              return (
                <li key={d}>
                  <button
                    onClick={() => setEdit(d)}
                    className={`flex min-h-14 w-full items-center gap-3 px-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 ${past ? 'opacity-50' : ''}`}
                  >
                    <span className={`w-28 shrink-0 text-sm ${d === today ? 'font-semibold text-brand-700 dark:text-brand-500' : 'text-neutral-500'}`}>
                      {dayLabel(d)}
                    </span>
                    {meal ? (
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 font-medium">
                        {meal.recipe_id && <BookOpen className="size-4 shrink-0 text-neutral-400" aria-label="Recept z kuchařky" />}
                        <span className="truncate">{meal.text}</span>
                      </span>
                    ) : (
                      <span className="flex flex-1 items-center gap-1 text-neutral-400">
                        <Plus className="size-4" /> {past ? '' : 'naplánovat'}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      <MealSheet date={edit} onClose={() => setEdit(null)} />
    </div>
  )
}
