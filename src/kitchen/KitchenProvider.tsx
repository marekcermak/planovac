import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useHousehold } from '../household/HouseholdProvider'
import type { Tables } from '../lib/database.types'
import { errorMessage, supabase } from '../lib/supabase'
import { buildIngredientIndex, type IngredientIndex } from './parse'

export type Ingredient = Tables<'ingredients'>
export type IngredientAlias = Tables<'ingredient_aliases'>
export type RecipeCategory = Tables<'recipe_categories'>
export type Recipe = Tables<'recipes'>
export type RecipeIngredient = Tables<'recipe_ingredients'>
export type RecipeCategoryLink = Tables<'recipe_category_links'>

type Data = {
  ingredients: Ingredient[]
  aliases: IngredientAlias[]
  categories: RecipeCategory[]
  recipes: Recipe[]
  links: RecipeCategoryLink[]
  recipeIngredients: RecipeIngredient[]
}

const EMPTY: Data = { ingredients: [], aliases: [], categories: [], recipes: [], links: [], recipeIngredients: [] }

type IdTable = 'ingredients' | 'ingredient_aliases' | 'recipe_categories' | 'recipes' | 'recipe_ingredients'
const KEY = {
  ingredients: 'ingredients',
  ingredient_aliases: 'aliases',
  recipe_categories: 'categories',
  recipes: 'recipes',
  recipe_ingredients: 'recipeIngredients',
} as const satisfies Record<IdTable, keyof Data>

type KitchenState = Data & {
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  index: IngredientIndex
  ingredientById: Map<string, Ingredient>
  recipeById: Map<string, Recipe>
  /** Suroviny receptu seřazené podle sort. */
  ingredientsOf: (recipeId: string) => RecipeIngredient[]
  categoriesOf: (recipeId: string) => RecipeCategory[]
  upsertLocal: <T extends IdTable>(table: T, row: Tables<T>) => void
  removeLocal: (table: IdTable, id: string) => void
}

const KitchenContext = createContext<KitchenState | null>(null)

function upsert<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((r) => r.id === row.id)
  if (i === -1) return [...list, row]
  const copy = list.slice()
  copy[i] = row
  return copy
}

/** Kuchařka a suroviny domácnosti + realtime (stejný princip jako StockProvider). */
export function KitchenProvider({ children }: { children: ReactNode }) {
  const { household } = useHousehold()
  const hh = household?.id ?? null
  const [data, setData] = useState<Data>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!hh) return
    try {
      const res = await Promise.all([
        supabase.from('ingredients').select('*').eq('household_id', hh),
        supabase.from('ingredient_aliases').select('*').eq('household_id', hh),
        supabase.from('recipe_categories').select('*').eq('household_id', hh),
        supabase.from('recipes').select('*').eq('household_id', hh),
        supabase.from('recipe_category_links').select('*').eq('household_id', hh),
        supabase.from('recipe_ingredients').select('*').eq('household_id', hh),
      ])
      for (const r of res) if (r.error) throw r.error
      const [ingredients, aliases, categories, recipes, links, recipeIngredients] = res
      setData({
        ingredients: ingredients.data ?? [],
        aliases: aliases.data ?? [],
        categories: categories.data ?? [],
        recipes: recipes.data ?? [],
        links: links.data ?? [],
        recipeIngredients: recipeIngredients.data ?? [],
      } as Data)
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [hh])

  const upsertLocal = useCallback(<T extends IdTable>(table: T, row: Tables<T>) => {
    const key = KEY[table]
    setData((d) => ({ ...d, [key]: upsert(d[key] as { id: string }[], row as { id: string }) }))
  }, [])

  const removeLocal = useCallback((table: IdTable, id: string) => {
    const key = KEY[table]
    setData((d) => ({ ...d, [key]: (d[key] as { id: string }[]).filter((r) => r.id !== id) }))
  }, [])

  const reloadLinks = useCallback(async () => {
    if (!hh) return
    const { data: links } = await supabase.from('recipe_category_links').select('*').eq('household_id', hh)
    if (links) setData((d) => ({ ...d, links }))
  }, [hh])

  useEffect(() => {
    if (!hh) return
    void reload()
    const onChange = (table: IdTable) => (p: RealtimePostgresChangesPayload<{ id: string }>) => {
      if (p.eventType === 'DELETE') {
        if (p.old.id) removeLocal(table, p.old.id)
      } else upsertLocal(table, p.new as never)
    }
    let channel = supabase.channel(`kitchen:${hh}`)
    const filter = `household_id=eq.${hh}`
    for (const table of Object.keys(KEY) as IdTable[]) {
      channel = channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, onChange(table))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, onChange(table))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, onChange(table))
    }
    // Vazby recept–kapitola nemají id → při změně je načíst znovu.
    channel = channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_category_links' }, () => void reloadLinks())
    let first = true
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (!first) void reload()
        first = false
      }
    })
    const onVisible = () => document.visibilityState === 'visible' && void reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [hh, reload, reloadLinks, upsertLocal, removeLocal])

  const value = useMemo<KitchenState>(() => {
    const ingredientById = new Map(data.ingredients.map((i) => [i.id, i]))
    const recipeById = new Map(data.recipes.map((r) => [r.id, r]))
    const categoryById = new Map(data.categories.map((c) => [c.id, c]))
    const byRecipe = new Map<string, RecipeIngredient[]>()
    for (const ri of data.recipeIngredients) {
      const list = byRecipe.get(ri.recipe_id) ?? []
      list.push(ri)
      byRecipe.set(ri.recipe_id, list)
    }
    for (const list of byRecipe.values()) list.sort((a, b) => a.sort - b.sort)
    const catsByRecipe = new Map<string, RecipeCategory[]>()
    for (const l of data.links) {
      const c = categoryById.get(l.category_id)
      if (!c) continue
      catsByRecipe.set(l.recipe_id, [...(catsByRecipe.get(l.recipe_id) ?? []), c])
    }
    return {
      ...data,
      categories: data.categories.slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'cs')),
      recipes: data.recipes.slice().sort((a, b) => a.title.localeCompare(b.title, 'cs')),
      ingredients: data.ingredients.slice().sort((a, b) => a.name.localeCompare(b.name, 'cs')),
      loading,
      error,
      reload,
      index: buildIngredientIndex(data.ingredients, data.aliases),
      ingredientById,
      recipeById,
      ingredientsOf: (id) => byRecipe.get(id) ?? [],
      categoriesOf: (id) => (catsByRecipe.get(id) ?? []).slice().sort((a, b) => a.sort - b.sort),
      upsertLocal,
      removeLocal,
    }
  }, [data, loading, error, reload, upsertLocal, removeLocal])

  return <KitchenContext.Provider value={value}>{children}</KitchenContext.Provider>
}

export function useKitchen() {
  const ctx = useContext(KitchenContext)
  if (!ctx) throw new Error('useKitchen mimo KitchenProvider')
  return ctx
}
