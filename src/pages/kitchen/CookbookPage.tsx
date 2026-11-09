import { BookOpen, ChefHat, ChevronLeft, ChevronRight, Clock, Plus, Search, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useParams, useSearchParams } from 'react-router'
import { Card, Chip, ErrorText, PageHeader } from '../../components/ui'
import { useSignedUrls } from '../../lib/images'
import { fold } from '../../lib/text'
import { useAvailability } from '../../kitchen/availability'
import { useKitchen, type Recipe } from '../../kitchen/KitchenProvider'

type Filter = '' | 'now' | 'max2'

/** ?kapitola=<id> | vse | bez – vybraná kapitola v URL, aby „zpět“ z receptu vrátil do ní. */
const ALL = 'vse'
const NONE = 'bez'

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
  const [params, setParams] = useSearchParams()
  const chapter = params.get('kapitola')
  const setChapter = (c: string | null) => setParams(c ? { kapitola: c } : {}, { replace: false })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('')
  const q = fold(query)

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of links) m.set(l.category_id, (m.get(l.category_id) ?? 0) + 1)
    return m
  }, [links])

  const titlesByChapter = useMemo(() => {
    const title = new Map(recipes.map((r) => [r.id, r.title]))
    const m = new Map<string, string[]>()
    for (const l of links) {
      const t = title.get(l.recipe_id)
      if (t) m.set(l.category_id, [...(m.get(l.category_id) ?? []), t])
    }
    return m
  }, [recipes, links])

  const uncategorized = useMemo(() => {
    const linked = new Set(links.map((l) => l.recipe_id))
    return recipes.filter((r) => !linked.has(r.id))
  }, [recipes, links])

  // Obsah = úvodní přehled kapitol; recepty až po výběru kapitoly, hledání nebo filtru.
  const showContents = !chapter && !q && !filter && recipes.length > 0
  const chapterInfo =
    chapter === ALL
      ? { icon: '📖', name: 'Všechny recepty' }
      : chapter === NONE
        ? { icon: '🗂️', name: 'Bez kapitoly' }
        : categories.find((c) => c.id === chapter)

  const list = recipes.filter((r) => {
    if (chapter === NONE && categoriesOf(r.id).length > 0) return false
    if (chapter && chapter !== ALL && chapter !== NONE && !categoriesOf(r.id).some((c) => c.id === chapter)) return false
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

      {chapter && chapterInfo && (
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setChapter(null)}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl pr-2 text-sm font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            <ChevronLeft className="size-4" /> Obsah
          </button>
          <h2 className="truncate text-lg font-semibold">
            {chapterInfo.icon} {chapterInfo.name}
          </h2>
        </div>
      )}
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
      ) : showContents ? (
        <nav aria-label="Obsah kuchařky">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-neutral-500 uppercase">Obsah</h2>
          <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
            {categories.map((c) => (
              <ChapterRow
                key={c.id}
                icon={c.icon}
                name={c.name}
                count={counts.get(c.id) ?? 0}
                preview={titlesByChapter.get(c.id) ?? []}
                onOpen={() => setChapter(c.id)}
              />
            ))}
            {uncategorized.length > 0 && (
              <ChapterRow
                icon="🗂️"
                name="Bez kapitoly"
                count={uncategorized.length}
                preview={uncategorized.map((r) => r.title)}
                onOpen={() => setChapter(NONE)}
              />
            )}
            <ChapterRow icon="📖" name="Všechny recepty" count={recipes.length} preview={[]} onOpen={() => setChapter(ALL)} />
          </ul>
          <p className="mt-2 text-sm text-neutral-500">
            Kapitoly upravíš v Nastavení → Kapitoly kuchařky. Recept může být ve více kapitolách.
          </p>
        </nav>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-neutral-500">Nic tu neodpovídá filtru.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-2">
          {list.map((r) => (
            <li key={r.id}>
              <RecipeCard
                recipe={r}
                selected={r.id === selectedId}
                missing={availability.summary(r.id).missing.length}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function ChapterRow({
  icon,
  name,
  count,
  preview,
  onOpen,
}: {
  icon: string
  name: string
  count: number
  preview: string[]
  onOpen: () => void
}) {
  return (
    <li className="border-b border-neutral-100 last:border-b-0 dark:border-neutral-800">
      <button
        onClick={onOpen}
        className={`flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 ${count === 0 ? 'opacity-50' : ''}`}
      >
        <span className="text-3xl" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{name}</span>
          {preview.length > 0 && <span className="block truncate text-sm text-neutral-500">{preview.slice(0, 4).join(' · ')}</span>}
        </span>
        <span className="shrink-0 text-sm font-medium text-neutral-500 tabular-nums">{count}</span>
        <ChevronRight className="size-5 shrink-0 text-neutral-400" />
      </button>
    </li>
  )
}

function RecipeCard({ recipe, selected, missing }: { recipe: Recipe; selected: boolean; missing: number }) {
  const { ingredientsOf } = useKitchen()
  const { search } = useLocation()
  const first = recipe.photo_paths[0]
  const urls = useSignedUrls(first ? [first] : [])
  const img = (first && urls[first]) || recipe.image_url
  const hasIngredients = ingredientsOf(recipe.id).length > 0

  return (
    <Link
      to={{ pathname: `/kucharka/${recipe.id}`, search }}
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
