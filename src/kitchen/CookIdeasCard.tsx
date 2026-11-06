import { Link } from 'react-router'
import { Card } from '../components/ui'
import { useKitchen } from './KitchenProvider'
import { explain, useSuggestions } from './suggest'

const NO_FILTER: string[] = []

/** Karta na Dnes: dva nejlepší tipy z „Co uvařit?“. */
export function CookIdeasCard() {
  const { recipes } = useKitchen()
  const top = useSuggestions(NO_FILTER, 2)
  return (
    <Card title="Co uvařit?">
      {recipes.length === 0 ? (
        <Link to="/kucharka/novy" className="block text-neutral-500">
          Kuchařka je prázdná. <span className="font-medium text-brand-700 dark:text-brand-500">Přidat první recept →</span>
        </Link>
      ) : (
        <>
          <ul className="mb-3 space-y-2">
            {top.map((s) => (
              <li key={s.recipe.id}>
                <Link to={`/kucharka/${s.recipe.id}`} className="block">
                  <span className="block font-medium">{s.recipe.title}</span>
                  <span className="block text-sm text-neutral-500">{explain(s)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/co-uvarit" className="text-sm font-medium text-brand-700 dark:text-brand-500">
            Další návrhy →
          </Link>
        </>
      )}
    </Card>
  )
}
