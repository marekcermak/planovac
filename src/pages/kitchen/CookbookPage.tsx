import { BookOpen, ChefHat, Clock, Plus, Search, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { Card, Chip, ErrorText, PageHeader } from '../../components/ui'
import { useSignedUrls } from '../../lib/images'
import { fold } from '../../lib/text'
import { useAvailability } from '../../kitchen/availability'
import { useKitchen, type Recipe } from '../../kitchen/KitchenProvider'

type Filter = '' | 'now' | 'max2'

/**
 * Kuchařka: kapitoly + seznam receptů. Na PC master–detail (seznam vlevo, recept vpravo),
 * na mobilu seznam a detail zvlášť.
 */
export function CookbookLayout() {
  const { id } = useParams()
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-8">
      <div className={id ? 'hidden lg:block' : ''}>
        <RecipeList selectedId={id} />
      </div>
      <div className={id ? '' : 'hidden lg:block'}>
        <Outlet />
      </div>
    </div>
  )
}

export function CookbookEmptyDetail() {
  return (
    <div className="sticky top-8 flex h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-200 text-neutral-400 dark:border-neutral-800">
      <BookOpen className="mb-2 size-8" />
      Vyber recept
    </div>
  )
}

function RecipeList({ selectedId }: { selectedId?: string }) {
  const { recipes, categories, categoriesOf, links, loading, error } = useKitchen()
  const availability = useAvailability()
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('')
  const q = fold(query)

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of links) m.set(l.category_id, (m.get(l.category_id) ?? 0) + 1)
    return m
  }, [links])

  const list = recipes.filter((r) => {
    if (categoryId && !categoriesOf(r.id).some((c) => c.id === categoryId)) return false
    if (q && !fold(r.title).includes(q) && !r.tags.some((t) => fold(t).includes(q))) return false
    if (filter) {
      const s = availability.summary(r.id)
      if (filter === 'now' && !s.canCook) return false
      if (filter === 'max2' && s.missing.length > 2) return false
    }
    return true
  })

  return (
    <>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <PageHeader title="Kuchařka" subtitle={loading ? 'Načítám…' : `${recipes.length} receptů`} />
        </div>
        <Link
          to="/kucharka/novy"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-700 px-4 font-medium text-white"
        >
          <Plus className="size-5" /> Recept
        </Link>
      </div>
      {recipes.length > 0 && (
        <Link
          to="/co-uvarit"
          className="mb-4 flex min-h-12 items-center gap-3 rounded-2xl bg-brand-50 px-4 font-medium text-brand-800 dark:bg-brand-800/30 dark:text-brand-100"
        >
          <ChefHat className="size-5" /> Co uvařit? <span className="text-sm font-normal opacity-80">podle toho, co je doma</span>
        </Link>
      )}
      <ErrorText>{error}</ErrorText>

      <label className="relative mb-3 block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          placeholder="Hledat recept"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="block min-h-12 w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-10 text-base outline-none focus:border-brand-600 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        <Chip active={categoryId === null} onClick={() => setCategoryId(null)}>
          Vše
        </Chip>
        {categories.map((c) => (
          <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>
            {c.icon} {c.name}
            {counts.get(c.id) ? <span className="opacity-60">{counts.get(c.id)}</span> : null}
          </Chip>
        ))}
      </div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <Chip active={filter === 'now'} onClick={() => setFilter(filter === 'now' ? '' : 'now')}>
          Můžu uvařit hned
        </Chip>
        <Chip active={filter === 'max2'} onClick={() => setFilter(filter === 'max2' ? '' : 'max2')}>
          Chybí max. 2 věci
        </Chip>
      </div>

      {!loading && recipes.length === 0 ? (
        <Card>
          <p className="mb-2">Kuchařka je zatím prázdná.</p>
          <Link to="/kucharka/novy" className="font-medium text-brand-700 dark:text-brand-500">
            Přidat první recept – vyfoť ho, vlož odkaz nebo text →
          </Link>
        </Card>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-neutral-500">Nic tu neodpovídá filtru.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-2">
          {list.map((r) => (
            <li key={r.id}>
              <RecipeCard recipe={r} selected={r.id === selectedId} missing={availability.summary(r.id).missing.length} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function RecipeCard({ recipe, selected, missing }: { recipe: Recipe; selected: boolean; missing: number }) {
  const { ingredientsOf } = useKitchen()
  const first = recipe.photo_paths[0]
  const urls = useSignedUrls(first ? [first] : [])
  const img = (first && urls[first]) || recipe.image_url
  const hasIngredients = ingredientsOf(recipe.id).length > 0

  return (
    <Link
      to={`/kucharka/${recipe.id}`}
      className={`flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 dark:bg-neutral-900 lg:flex-row lg:items-center ${
        selected ? 'ring-2 ring-brand-600' : 'ring-neutral-200 dark:ring-neutral-800'
      }`}
    >
      <div className="aspect-[4/3] w-full shrink-0 bg-neutral-100 lg:aspect-square lg:w-20 dark:bg-neutral-800">
        {img ? (
          <img src={img} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-3xl">🍽️</div>
        )}
      </div>
      <div className="min-w-0 flex-1 p-2.5">
        <div className="line-clamp-2 leading-tight font-medium">{recipe.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
          {recipe.prep_minutes ? (
            <span className="inline-flex items-center gap-0.5">
              <Clock className="size-3.5" /> {recipe.prep_minutes} min
            </span>
          ) : null}
          {recipe.rating ? (
            <span className="inline-flex items-center gap-0.5">
              <Star className="size-3.5 fill-amber-400 text-amber-400" /> {recipe.rating}
            </span>
          ) : null}
          {hasIngredients &&
            (missing === 0 ? (
              <span className="rounded-full bg-green-100 px-1.5 text-green-800 dark:bg-green-950 dark:text-green-300">mám vše</span>
            ) : (
              <span className="rounded-full bg-neutral-100 px-1.5 dark:bg-neutral-800">chybí {missing}</span>
            ))}
        </div>
      </div>
    </Link>
  )
}
