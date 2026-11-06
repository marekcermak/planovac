import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useHousehold } from '../household/HouseholdProvider'
import type { Tables } from '../lib/database.types'
import { errorMessage, supabase } from '../lib/supabase'
import { addDays, todayIso } from '../stock/expiry'

export type Meal = Tables<'meal_plan'>

type MealsState = {
  meals: Meal[]
  mealOn: (date: string) => Meal | undefined
  /** Uloží jídlo na den (prázdný text = smazat). */
  setMeal: (date: string, text: string, recipeId?: string | null) => Promise<void>
}

const MealsContext = createContext<MealsState | null>(null)

/** Jídelníček domácnosti (jedno jídlo na den) + realtime. */
export function MealsProvider({ children }: { children: ReactNode }) {
  const { household } = useHousehold()
  const hh = household?.id ?? null
  const [meals, setMeals] = useState<Meal[]>([])

  const reload = useCallback(async () => {
    if (!hh) return
    const { data } = await supabase.from('meal_plan').select('*').eq('household_id', hh).gte('date', addDays(todayIso(), -60))
    if (data) setMeals(data)
  }, [hh])

  useEffect(() => {
    if (!hh) return
    void reload()
    const on = (p: RealtimePostgresChangesPayload<Meal>) => {
      if (p.eventType === 'DELETE') {
        const id = (p.old as Partial<Meal>).id
        if (id) setMeals((l) => l.filter((m) => m.id !== id))
      } else {
        const row = p.new as Meal
        setMeals((l) => [...l.filter((m) => m.id !== row.id && m.date !== row.date), row])
      }
    }
    const filter = `household_id=eq.${hh}`
    const channel = supabase
      .channel(`meals:${hh}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meal_plan', filter }, on)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meal_plan', filter }, on)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'meal_plan' }, on)
      .subscribe()
    const onVisible = () => document.visibilityState === 'visible' && void reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [hh, reload])

  const value = useMemo<MealsState>(() => {
    const byDate = new Map(meals.map((m) => [m.date, m]))
    return {
      meals,
      mealOn: (date) => byDate.get(date),
      async setMeal(date, text, recipeId = null) {
        if (!hh) throw new Error('Chybí domácnost.')
        const t = text.trim().slice(0, 80)
        if (!t) {
          const { error } = await supabase.from('meal_plan').delete().eq('household_id', hh).eq('date', date)
          if (error) throw new Error(errorMessage(error))
          setMeals((l) => l.filter((m) => m.date !== date))
          return
        }
        const { data, error } = await supabase
          .from('meal_plan')
          .upsert({ household_id: hh, date, text: t, recipe_id: recipeId, updated_at: new Date().toISOString() }, { onConflict: 'household_id,date' })
          .select()
          .single()
        if (error) throw new Error(errorMessage(error))
        setMeals((l) => [...l.filter((m) => m.date !== date), data])
      },
    }
  }, [meals, hh])

  return <MealsContext.Provider value={value}>{children}</MealsContext.Provider>
}

export function useMeals() {
  const ctx = useContext(MealsContext)
  if (!ctx) throw new Error('useMeals mimo MealsProvider')
  return ctx
}
