import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useToast } from '../../components/Toast'
import { Button, Card, ErrorText, Field, PageHeader } from '../../components/ui'
import { useHousehold } from '../../household/HouseholdProvider'
import { errorMessage, supabase } from '../../lib/supabase'
import { useKitchen, type RecipeCategory } from '../../kitchen/KitchenProvider'
import { BackLink } from './ZonesPage'

/** Kapitoly kuchařky: přejmenovat, ikona, pořadí, přidat, smazat. */
export function RecipeCategoriesPage() {
  const { household } = useHousehold()
  const { categories, links, upsertLocal, removeLocal, reload } = useKitchen()
  const toast = useToast()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🍽️')
  const [error, setError] = useState<string | null>(null)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!household) return
    const { data, error } = await supabase
      .from('recipe_categories')
      .insert({ household_id: household.id, name: name.trim(), icon: icon.trim() || '🍽️', sort: (categories.at(-1)?.sort ?? 0) + 1 })
      .select()
      .single()
    if (error) return setError(/unique|duplicate/i.test(error.message) ? 'Kapitola s tímhle názvem už je.' : errorMessage(error))
    upsertLocal('recipe_categories', data)
    setName('')
    setIcon('🍽️')
  }

  async function update(c: RecipeCategory, patch: Partial<RecipeCategory>) {
    const { data, error } = await supabase.from('recipe_categories').update(patch).eq('id', c.id).select().single()
    if (error) return setError(errorMessage(error))
    upsertLocal('recipe_categories', data)
  }

  async function swap(a: RecipeCategory, b: RecipeCategory) {
    await update(a, { sort: b.sort })
    await update(b, { sort: a.sort === b.sort ? a.sort + 1 : a.sort })
  }

  async function remove(c: RecipeCategory) {
    const { error } = await supabase.from('recipe_categories').delete().eq('id', c.id)
    if (error) return setError(errorMessage(error))
    removeLocal('recipe_categories', c.id)
    await reload()
    toast(`Kapitola ${c.name} smazána (recepty zůstaly)`)
  }

  return (
    <div className="max-w-2xl">
      <BackLink to="/vice/nastaveni" label="Nastavení" />
      <PageHeader title="Kapitoly kuchařky" subtitle="Recept může být ve více kapitolách." />
      <ul className="mb-6 divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
        {categories.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2">
            <input
              aria-label="Ikona"
              defaultValue={c.icon}
              maxLength={8}
              onBlur={(e) => e.target.value !== c.icon && void update(c, { icon: e.target.value || '🍽️' })}
              className="min-h-11 w-12 rounded-lg bg-neutral-100 text-center text-xl dark:bg-neutral-800"
            />
            <input
              aria-label="Název kapitoly"
              defaultValue={c.name}
              maxLength={40}
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && void update(c, { name: e.target.value.trim() })}
              className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-2 font-medium"
            />
            <span className="text-xs text-neutral-500">{links.filter((l) => l.category_id === c.id).length}</span>
            <div className="flex flex-col">
              <button aria-label="Nahoru" disabled={i === 0} onClick={() => void swap(c, categories[i - 1])} className="p-1 text-neutral-400 disabled:opacity-30">
                <ArrowUp className="size-4" />
              </button>
              <button aria-label="Dolů" disabled={i === categories.length - 1} onClick={() => void swap(c, categories[i + 1])} className="p-1 text-neutral-400 disabled:opacity-30">
                <ArrowDown className="size-4" />
              </button>
            </div>
            <button aria-label={`Smazat ${c.name}`} onClick={() => void remove(c)} className="p-2 text-neutral-400 hover:text-red-600">
              <Trash2 className="size-5" />
            </button>
          </li>
        ))}
      </ul>
      <Card title="Nová kapitola">
        <form onSubmit={add} className="flex items-end gap-2">
          <div className="w-20">
            <Field label="Ikona" maxLength={8} value={icon} onChange={(e) => setIcon(e.target.value)} />
          </div>
          <div className="flex-1">
            <Field label="Název" required maxLength={40} placeholder="např. Grilování" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" disabled={!name.trim()} aria-label="Přidat kapitolu">
            <Plus className="size-5" />
          </Button>
        </form>
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      </Card>
    </div>
  )
}
