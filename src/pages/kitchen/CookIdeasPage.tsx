import { ChevronLeft, ShoppingCart, Star } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Card, Chip, PageHeader } from '../../components/ui'
import { useKitchen } from '../../kitchen/KitchenProvider'
import { explain, useSuggestions, type Suggestion } from '../../kitchen/suggest'
import { useSignedUrls } from '../../lib/images'
import { AddFromRecipeSheet } from '../../shopping/AddFromRecipeSheet'

// Kapitoly, které „k obědu / večeři“ nepatří (výchozí názvy; vlastní kapitoly se nefiltrují).
const NOT_MAIN = ['snídaně', 'sladké', 'pečení', 'omáčky a dipy', 'přílohy']

/** „Co uvařit?“ – top 5 receptů podle toho, co je doma a co prochází (bez AI). */
export function CookIdeasPage() {
  const { categories, recipes, loading } = useKitchen()
  const [selected, setSelected] = useState<string[]>([])
  const suggestions = useSuggestions(selected)
  const [shopFor, setShopFor] = useState<string | null>(null)

  const mainIds = categories.filter((c) => !NOT_MAIN.includes(c.name.toLowerCase())).map((c) => c.id)
  const isMain = selected.length > 0 && selected.length === mainIds.length && mainIds.every((id) => selected.includes(id))
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div className="max-w-3xl">
      <Link to="/kucharka" className="mb-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-neutral-500">
        <ChevronLeft className="size-4" /> Kuchařka
      </Link>
      <PageHeader title="Co uvařit?" subtitle="Podle toho, co máte doma a co brzy projde." />

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        <Chip active={selected.length === 0} onClick={() => setSelected([])}>
          Cokoliv
        </Chip>
        <Chip active={isMain} onClick={() => setSelected(isMain ? [] : mainIds)}>
          Oběd / večeře
        </Chip>
        {categories.map((c) => (
          <Chip key={c.id} active={!isMain && selected.includes(c.id)} onClick={() => (isMain ? setSelected([c.id]) : toggle(c.id))}>
            {c.icon} {c.name}
          </Chip>
        ))}
      </div>

      {suggestions.length === 0 ? (
        <Card>
          <p className="text-neutral-500">
            {loading
              ? 'Načítám…'
              : recipes.length === 0
                ? 'Kuchařka je zatím prázdná. Přidej pár receptů a tady se objeví návrhy.'
                : 'V téhle kapitole nejsou recepty se surovinami.'}
          </p>
        </Card>
      ) : (
        <ol className="space-y-3">
          {suggestions.map((s, i) => (
            <SuggestionCard key={s.recipe.id} rank={i + 1} s={s} onShop={() => setShopFor(s.recipe.id)} />
          ))}
        </ol>
      )}

      {shopFor && <AddFromRecipeSheet recipeId={shopFor} factor={1} open onClose={() => setShopFor(null)} />}
    </div>
  )
}

function SuggestionCard({ rank, s, onShop }: { rank: number; s: Suggestion; onShop: () => void }) {
  const urls = useSignedUrls(s.recipe.photo_paths.slice(0, 1))
  const img = (s.recipe.photo_paths[0] && urls[s.recipe.photo_paths[0]]) || s.recipe.image_url
  return (
    <li className="overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
      <Link to={`/kucharka/${s.recipe.id}`} className="flex gap-3 p-3">
        {img ? (
          <img src={img} alt="" className="size-20 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-2xl font-bold text-neutral-400 dark:bg-neutral-800">
            {rank}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 font-semibold">
            {s.recipe.title}
            {s.recipe.rating ? (
              <span className="inline-flex items-center text-sm font-normal text-amber-500">
                <Star className="size-4 fill-current" /> {s.recipe.rating}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-sm text-neutral-600 dark:text-neutral-400">{explain(s)}</span>
        </span>
      </Link>
      {s.missing.length > 0 && (
        <div className="border-t border-neutral-100 px-3 py-2 dark:border-neutral-800">
          <Button variant="ghost" className="min-h-10 text-sm" onClick={onShop}>
            <ShoppingCart className="size-4" /> Chybějící do nákupu ({s.missing.length})
          </Button>
        </div>
      )}
    </li>
  )
}
