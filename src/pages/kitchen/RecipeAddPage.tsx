import { Camera, ClipboardPaste, Link2, PencilLine, Sparkles, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Button, Card, ErrorText, Field, PageHeader } from '../../components/ui'
import { callAi, useAi } from '../../lib/AiProvider'
import { invokeFunction } from '../../lib/functions'
import { blobToBase64, shrinkImage } from '../../lib/images'
import { fold } from '../../lib/text'
import { useKitchen } from '../../kitchen/KitchenProvider'
import { parseIngredientLine, parseRecipeText, type ParsedLine } from '../../kitchen/parse'
import {
  draftFromRecipe,
  emptyDraft,
  RecipeEditor,
  rowFromParsed,
  rowKey,
  type RecipeDraft,
} from '../../kitchen/RecipeEditor'
import { BackLink } from '../settings/ZonesPage'

type Source = 'photo' | 'url' | 'text' | 'manual'

type AiDraft = {
  title: string
  servings: number | null
  prep_minutes: number | null
  ingredients: { name: string; quantity: number | null; unit: string | null; note: string | null; optional: boolean }[]
  steps: string[]
  notes: string
  categories: string[]
  tags: string[]
  source_url: string | null
  image_url: string | null
}

type ImportResult =
  | { found: true; url: string; draft: { title: string; servings: number | null; prep_minutes: number | null; ingredient_lines: string[]; steps: string[]; image_url: string | null } }
  | { found: false; url: string; title: string | null; image_url: string | null }

export function RecipeAddPage() {
  const { categories, index } = useKitchen()
  const { available: aiOn, status, refresh } = useAi()
  const [source, setSource] = useState<Source | null>(null)
  const [draft, setDraft] = useState<RecipeDraft | null>(null)
  const [photos, setPhotos] = useState<Blob[]>([])
  const [keepPhotos, setKeepPhotos] = useState(true)
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [previews] = useState(() => new Map<Blob, string>())
  const preview = (b: Blob) => {
    if (!previews.has(b)) previews.set(b, URL.createObjectURL(b))
    return previews.get(b)!
  }

  const categoryIdsByName = (names: string[]) =>
    names
      .map((n) => categories.find((c) => fold(c.name) === fold(n))?.id)
      .filter((x): x is string => !!x)

  function fromAi(r: AiDraft, sourceType: RecipeDraft['sourceType'], extra: Partial<RecipeDraft> = {}): RecipeDraft {
    return {
      ...emptyDraft(),
      title: r.title,
      servings: r.servings?.toString() ?? '',
      prepMinutes: r.prep_minutes?.toString() ?? '',
      steps: r.steps.join('\n\n'),
      notes: r.notes,
      tags: r.tags,
      categoryIds: categoryIdsByName(r.categories),
      sourceType,
      sourceUrl: r.source_url ?? '',
      imageUrl: r.image_url ?? '',
      ingredients: r.ingredients.map((i) => ({
        key: rowKey(),
        name: i.name,
        quantity: i.quantity != null ? String(i.quantity).replace('.', ',') : '',
        unit: i.unit ?? '',
        note: i.note ?? '',
        optional: i.optional,
        ingredientId: index.match(i.name),
      })),
      ...extra,
    }
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label)
    setError(null)
    setNotice(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const fromPhotos = () =>
    run('Čtu recept z fotky… (chvilku to trvá)', async () => {
      const images = await Promise.all(
        photos.map(async (p) => ({ media_type: 'image/jpeg', data: await blobToBase64(p) })),
      )
      const r = await callAi<{ draft: AiDraft }>('recipe_extract', { images }, refresh)
      setDraft(fromAi(r.draft, 'photo', { newPhotos: keepPhotos ? photos : [] }))
    })

  const fromUrl = () =>
    run('Načítám stránku…', async () => {
      const res = await invokeFunction<ImportResult>('recipe-import', { url: url.trim() })
      if (res.found) {
        const d = res.draft
        setDraft({
          ...emptyDraft(),
          title: d.title,
          servings: d.servings?.toString() ?? '',
          prepMinutes: d.prep_minutes?.toString() ?? '',
          steps: d.steps.join('\n\n'),
          sourceType: 'url',
          sourceUrl: res.url,
          imageUrl: d.image_url ?? '',
          ingredients: d.ingredient_lines
            .map(parseIngredientLine)
            .filter((p): p is ParsedLine => !!p)
            .map((p) => rowFromParsed(p, index.match)),
        })
        return
      }
      if (aiOn) {
        setBusy('Stránka nemá strukturovaný recept, čte ho AI…')
        const r = await callAi<{ draft: AiDraft }>('recipe_extract', { url: res.url }, refresh)
        setDraft(fromAi(r.draft, 'url'))
        return
      }
      setNotice('Tahle stránka nemá recept ve strojově čitelné podobě. Doplň ho ručně, nebo zapni AI v Nastavení.')
      setDraft({ ...emptyDraft(), title: res.title ?? '', sourceType: 'url', sourceUrl: res.url, imageUrl: res.image_url ?? '' })
    })

  const fromTextAi = () =>
    run('Převádím text…', async () => {
      const r = await callAi<{ draft: AiDraft }>('recipe_extract', { text }, refresh)
      setDraft(fromAi(r.draft, 'text'))
    })

  function fromTextLocal() {
    const p = parseRecipeText(text)
    setDraft({
      ...emptyDraft(),
      title: p.title,
      steps: p.steps.join('\n\n'),
      sourceType: 'text',
      ingredients: p.ingredients.map((i) => rowFromParsed(i, index.match)),
    })
  }

  if (draft) {
    return (
      <div>
        <button onClick={() => setDraft(null)} className="mb-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-neutral-500">
          <X className="size-4" /> Zpět na výběr zdroje
        </button>
        <PageHeader title="Zkontroluj recept" subtitle="Uprav, co je potřeba, a ulož do kuchařky." />
        {notice && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{notice}</p>}
        <RecipeEditor initial={draft} />
      </div>
    )
  }

  const tabs: { id: Source; label: string; icon: typeof Camera }[] = [
    { id: 'photo', label: 'Fotka', icon: Camera },
    { id: 'url', label: 'Odkaz', icon: Link2 },
    { id: 'text', label: 'Text', icon: ClipboardPaste },
    { id: 'manual', label: 'Ručně', icon: PencilLine },
  ]

  return (
    <div className="max-w-2xl">
      <BackLink to="/kucharka" label="Kuchařka" />
      <PageHeader title="Nový recept" subtitle="Odkud recept bereš?" />

      <div className="mb-5 grid grid-cols-4 gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => (id === 'manual' ? setDraft(emptyDraft()) : setSource(id))}
            className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl text-sm font-medium ring-1 ${
              source === id
                ? 'bg-brand-700 text-white ring-brand-700'
                : 'bg-white ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800'
            }`}
          >
            <Icon className="size-6" /> {label}
          </button>
        ))}
      </div>

      {source === 'photo' && (
        <Card>
          <p className="mb-3 text-neutral-600 dark:text-neutral-400">
            Vyfoť stránku z kuchařky (u delšího receptu i víc stránek).
            {aiOn ? ' AI z ní přečte suroviny i postup.' : ''}
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative">
                <img src={preview(p)} alt="" className="size-24 rounded-xl object-cover" />
                <button
                  aria-label="Odebrat"
                  onClick={() => setPhotos(photos.filter((x) => x !== p))}
                  className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-neutral-900 text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {photos.length < 4 && (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex size-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-neutral-300 text-sm text-neutral-500 dark:border-neutral-700"
              >
                <Camera className="size-6" /> {photos.length ? 'Další' : 'Vyfotit'}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                const blobs = await Promise.all(files.map((f) => shrinkImage(f, 2000, 0.88)))
                setPhotos((p) => [...p, ...blobs].slice(0, 4))
              }}
            />
          </div>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={keepPhotos} onChange={(e) => setKeepPhotos(e.target.checked)} />
            Fotku uložit i k receptu
          </label>
          {aiOn ? (
            <Button className="w-full" disabled={!photos.length || !!busy} onClick={() => void fromPhotos()}>
              <Sparkles className="size-5" /> Převést na recept
            </Button>
          ) : (
            <>
              <AiOffNote configured={status?.configured} />
              <Button
                variant="secondary"
                className="mt-3 w-full"
                disabled={!photos.length}
                onClick={() => setDraft({ ...emptyDraft(), sourceType: 'photo', newPhotos: photos })}
              >
                Uložit fotku a recept přepsat ručně
              </Button>
            </>
          )}
        </Card>
      )}

      {source === 'url' && (
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void fromUrl()
            }}
            className="space-y-3"
          >
            <Field
              label="Odkaz na recept"
              type="url"
              inputMode="url"
              required
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={!url.trim() || !!busy}>
              Načíst recept
            </Button>
          </form>
        </Card>
      )}

      {source === 'text' && (
        <Card>
          <textarea
            rows={10}
            placeholder="Vlož text receptu – název, suroviny, postup…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mb-3 block w-full rounded-xl border border-neutral-300 bg-white p-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
          />
          <div className="flex flex-wrap gap-2">
            {aiOn && (
              <Button disabled={!text.trim() || !!busy} onClick={() => void fromTextAi()}>
                <Sparkles className="size-5" /> Převést s AI
              </Button>
            )}
            <Button variant={aiOn ? 'secondary' : 'primary'} disabled={!text.trim() || !!busy} onClick={fromTextLocal}>
              {aiOn ? 'Bez AI' : 'Převést'}
            </Button>
          </div>
        </Card>
      )}

      {busy && <p className="mt-4 animate-pulse text-center text-neutral-500">{busy}</p>}
      <div className="mt-4">
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  )
}

function AiOffNote({ configured }: { configured?: boolean }) {
  return (
    <p className="rounded-xl bg-neutral-100 p-3 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
      Přečíst recept z fotky umí jen AI, která je {configured ? 'vypnutá' : 'zatím nenastavená'}.{' '}
      <Link to="/vice/nastaveni/ai" className="font-medium text-brand-700 dark:text-brand-500">
        Nastavení AI →
      </Link>
    </p>
  )
}

export function RecipeEditPage() {
  const { id } = useParams()
  const { recipeById, ingredientsOf, categoriesOf, loading } = useKitchen()
  const recipe = id ? recipeById.get(id) : undefined
  if (!recipe) return <p className="text-neutral-500">{loading ? 'Načítám…' : 'Recept nenalezen.'}</p>
  return (
    <div>
      <BackLink to={`/kucharka/${recipe.id}`} label={recipe.title} />
      <PageHeader title="Upravit recept" />
      <RecipeEditor
        key={recipe.id}
        recipeId={recipe.id}
        initial={draftFromRecipe(recipe, ingredientsOf(recipe.id), categoriesOf(recipe.id).map((c) => c.id))}
      />
    </div>
  )
}
