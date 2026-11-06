import { Camera, ChevronLeft, ImagePlus, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useToast } from '../../components/Toast'
import { Button, Chip, ErrorText, Field, PageHeader, SelectField } from '../../components/ui'
import { useHousehold } from '../../household/HouseholdProvider'
import { SOURCE_LABEL, useJournal, type Entry } from '../../journal/JournalProvider'
import { JOURNAL_BUCKET, useSignedUrls } from '../../lib/images'
import { todayIso } from '../../stock/expiry'

/** Nový zápis (/denik/novy?kapitola=…&foto=1). */
export function EntryNewPage() {
  const [params] = useSearchParams()
  return <EntryEditor entry={null} initialChapter={params.get('kapitola')} photoFirst={params.get('foto') === '1'} />
}

/** Úprava zápisu (/denik/:id/upravit). */
export function EntryEditPage() {
  const { id } = useParams()
  const { entries, loading } = useJournal()
  const entry = entries.find((e) => e.id === id)
  if (!entry) return <p className="text-neutral-500">{loading ? 'Načítám…' : 'Zápis nenalezen.'}</p>
  return <EntryEditor key={entry.id} entry={entry} />
}

function parseTags(s: string): string[] {
  return [...new Set(s.split(/[\s,]+/).map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean))].slice(0, 20)
}

function EntryEditor({ entry, initialChapter, photoFirst }: { entry: Entry | null; initialChapter?: string | null; photoFirst?: boolean }) {
  const { chapters, saveEntry } = useJournal()
  const { me } = useHousehold()
  const navigate = useNavigate()
  const toast = useToast()
  const writable = chapters.filter((c) => !c.archived && (c.owner_id === me?.user_id || c.visibility === 'shared'))
  // Výchozí kapitola se dopočítá, i když se kapitoly načtou až po otevření.
  const [picked, setChapterId] = useState<string | null>(entry?.chapter_id ?? null)
  const chapterId =
    picked ??
    writable.find((c) => c.id === initialChapter)?.id ??
    writable.find((c) => c.name === (photoFirst ? 'Deník' : 'Myšlenky'))?.id ??
    writable[0]?.id ??
    ''
  const [title, setTitle] = useState(entry?.title ?? '')
  const [body, setBody] = useState(entry?.body ?? '')
  const [date, setDate] = useState(entry?.entry_date ?? todayIso())
  const [sourceType, setSourceType] = useState(entry?.source_type ?? 'vlastni')
  const [sourceRef, setSourceRef] = useState(entry?.source_ref ?? '')
  const [tags, setTags] = useState(entry?.tags.map((t) => `#${t}`).join(' ') ?? '')
  const [pinned, setPinned] = useState(entry?.pinned ?? false)
  const [keep, setKeep] = useState<string[]>(entry?.photo_paths ?? [])
  const [added, setAdded] = useState<Blob[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urls = useSignedUrls(keep, JOURNAL_BUCKET)
  const previews = useMemo(() => added.map((b) => URL.createObjectURL(b)), [added])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!chapterId) return
    setBusy(true)
    setError(null)
    try {
      const saved = await saveEntry(
        entry?.id ?? null,
        {
          chapter_id: chapterId,
          title: title.trim() || null,
          body: body.trim(),
          entry_date: date || todayIso(),
          source_type: sourceType,
          source_ref: sourceType === 'vlastni' ? null : sourceRef.trim() || null,
          tags: parseTags(tags),
          pinned,
        },
        { keep, add: added },
      )
      toast(entry ? 'Uloženo' : 'Zápis přidán')
      navigate(`/denik/${saved.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nepodařilo se uložit.')
    } finally {
      setBusy(false)
    }
  }

  const photoInput = (capture: boolean, children: ReactNode) => (
    <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 font-medium ring-1 ring-neutral-300 dark:bg-neutral-800 dark:ring-neutral-700">
      {children}
      <input
        type="file"
        accept="image/*"
        multiple={!capture}
        {...(capture ? { capture: 'environment' as const } : {})}
        className="sr-only"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          if (files.length) setAdded((a) => [...a, ...files].slice(0, 10))
          e.target.value = ''
        }}
      />
    </label>
  )

  const photos = (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {photoInput(true, <><Camera className="size-5" /> Vyfotit</>)}
        {photoInput(false, <><ImagePlus className="size-5" /> Z galerie</>)}
      </div>
      {(keep.length > 0 || added.length > 0) && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {keep.map((p) => (
            <Thumb key={p} src={urls[p]} onRemove={() => setKeep(keep.filter((x) => x !== p))} />
          ))}
          {previews.map((u, i) => (
            <Thumb key={u} src={u} onRemove={() => setAdded(added.filter((_, j) => j !== i))} />
          ))}
        </div>
      )}
      {photoFirst && !entry && (
        <p className="text-sm text-neutral-500">
          Tip: text z fotky zkopíruješ bez AI – na iPhonu podrž prst na textu ve fotce (Živý text), na Androidu Google Lens. Pak ho vlož níž.
        </p>
      )}
    </div>
  )

  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-2xl space-y-4 pb-6">
      <Link to={entry ? `/denik/${entry.id}` : '/denik'} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-neutral-500">
        <ChevronLeft className="size-4" /> {entry ? 'Zpět' : 'Deník'}
      </Link>
      <PageHeader title={entry ? 'Upravit zápis' : photoFirst ? 'Fotka poznámek' : 'Nový zápis'} />

      {photoFirst && photos}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <SelectField label="Kapitola" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
          {writable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
              {c.visibility === 'shared' ? ' (sdílená)' : ''}
            </option>
          ))}
        </SelectField>
        <Field label="Datum" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <Field label="Nadpis (nepovinný)" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Text</span>
        <textarea
          rows={10}
          maxLength={50000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base leading-relaxed outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Zdroj</span>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {Object.entries(SOURCE_LABEL).map(([k, v]) => (
            <Chip key={k} active={sourceType === k} onClick={() => setSourceType(k)}>
              {v}
            </Chip>
          ))}
        </div>
        {sourceType !== 'vlastni' && (
          <input
            value={sourceRef}
            onChange={(e) => setSourceRef(e.target.value)}
            maxLength={300}
            placeholder={sourceType === 'kniha' ? 'Název knihy, autor' : 'Název nebo odkaz'}
            className="mt-2 block min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base dark:border-neutral-700 dark:bg-neutral-900"
          />
        )}
      </div>

      <Field label="Štítky" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#rodina #nápad" />

      {!photoFirst && (
        <div>
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Fotky</span>
          {photos}
        </div>
      )}

      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-5 accent-brand-700" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        <span>Připnout nahoru</span>
      </label>

      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy || !chapterId || (!body.trim() && !title.trim() && keep.length + added.length === 0)}>
        {busy ? 'Ukládám…' : 'Uložit'}
      </Button>
    </form>
  )
}

function Thumb({ src, onRemove }: { src?: string; onRemove: () => void }) {
  return (
    <div className="relative">
      {src ? <img src={src} alt="" className="aspect-square w-full rounded-xl object-cover" /> : <div className="aspect-square rounded-xl bg-neutral-100 dark:bg-neutral-800" />}
      <button
        type="button"
        aria-label="Odebrat fotku"
        onClick={onRemove}
        className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-black/60 text-white"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
