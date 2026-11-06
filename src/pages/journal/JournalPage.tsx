import { Camera, Image as ImageIcon, Lock, Pin, Plus, Search, Settings2, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Card, Chip, ErrorText, PageHeader } from '../../components/ui'
import { useHousehold } from '../../household/HouseholdProvider'
import { SOURCE_LABEL, useJournal, type Entry } from '../../journal/JournalProvider'
import { QuickThoughtButton } from '../../journal/QuickThought'
import { fold } from '../../lib/text'
import { ChaptersSheet } from './ChaptersSheet'

const monthFmt = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'UTC' })
const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`)

/** Deník: kapitoly (chipy na mobilu, seznam vlevo na PC), časová osa, hledání, filtry zdroje a štítku. */
export function JournalPage() {
  const { chapters, entries, chapterById, loading, error } = useJournal()
  const { members } = useHousehold()
  const [params, setParams] = useSearchParams()
  const chapterId = params.get('kapitola')
  const tag = params.get('stitek')
  const source = params.get('zdroj')
  const [query, setQuery] = useState('')
  const [managing, setManaging] = useState(false)
  const q = fold(query.trim())
  const visibleChapters = chapters.filter((c) => !c.archived)
  const chapter = chapterId ? chapterById.get(chapterId) : undefined

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const archivedIds = new Set(chapters.filter((c) => c.archived).map((c) => c.id))
  const list = entries.filter((e) => {
    if (chapterId ? e.chapter_id !== chapterId : archivedIds.has(e.chapter_id)) return false
    if (tag && !e.tags.includes(tag)) return false
    if (source && e.source_type !== source) return false
    if (q) {
      const hay = fold([e.title, e.body, e.source_ref, e.tags.join(' ')].filter(Boolean).join(' '))
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false
    }
    return true
  })
  const pinned = list.filter((e) => e.pinned)
  const rest = list.filter((e) => !e.pinned)
  const byMonth = new Map<string, Entry[]>()
  for (const e of rest) byMonth.set(e.entry_date.slice(0, 7), [...(byMonth.get(e.entry_date.slice(0, 7)) ?? []), e])

  const tags = [...new Set(entries.filter((e) => !chapterId || e.chapter_id === chapterId).flatMap((e) => e.tags))].sort((a, b) =>
    a.localeCompare(b, 'cs'),
  )
  const sources = [...new Set(entries.map((e) => e.source_type))].filter((s) => s !== 'vlastni')
  const author = (id: string) => (members.length > 1 ? members.find((m) => m.user_id === id) : undefined)

  const newLink = `/denik/novy${chapterId ? `?kapitola=${chapterId}` : ''}`

  return (
    <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
      {/* Kapitoly – PC */}
      <aside className="hidden lg:block">
        <div className="sticky top-8 space-y-1">
          <ChapterLink active={!chapterId} onClick={() => setParam('kapitola', null)} label="Vše" icon="🗂️" count={entries.length} />
          {visibleChapters.map((c) => (
            <ChapterLink
              key={c.id}
              active={chapterId === c.id}
              onClick={() => setParam('kapitola', c.id)}
              label={c.name}
              icon={c.icon}
              shared={c.visibility === 'shared'}
              count={entries.filter((e) => e.chapter_id === c.id).length}
            />
          ))}
          <button
            onClick={() => setManaging(true)}
            className="mt-2 flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Settings2 className="size-4" /> Upravit kapitoly
          </button>
        </div>
      </aside>

      <div className="max-w-3xl">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <PageHeader title={chapter ? `${chapter.icon} ${chapter.name}` : 'Deník'} subtitle={loading ? 'Načítám…' : `${list.length} zápisů`} />
          </div>
          <Link to={newLink} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-700 px-4 font-medium text-white">
            <Plus className="size-5" /> Zápis
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <QuickThoughtButton />
          <Link
            to={`/denik/novy?foto=1${chapterId ? `&kapitola=${chapterId}` : ''}`}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-4 font-medium ring-1 ring-neutral-300 dark:bg-neutral-800 dark:ring-neutral-700"
          >
            <Camera className="size-5" /> Vyfotit poznámky
          </Link>
        </div>

        {/* Kapitoly – mobil */}
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          <Chip active={!chapterId} onClick={() => setParam('kapitola', null)}>
            Vše
          </Chip>
          {visibleChapters.map((c) => (
            <Chip key={c.id} active={chapterId === c.id} onClick={() => setParam('kapitola', c.id)}>
              {c.icon} {c.name}
            </Chip>
          ))}
          <Chip active={false} onClick={() => setManaging(true)} aria-label="Upravit kapitoly">
            <Settings2 className="size-4" />
          </Chip>
        </div>

        <label className="relative mb-3 block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            placeholder="Hledat v deníku"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="block min-h-12 w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-10 text-base outline-none focus:border-brand-600 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        {(sources.length > 0 || tags.length > 0) && (
          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
            {sources.map((s) => (
              <Chip key={s} active={source === s} onClick={() => setParam('zdroj', source === s ? null : s)}>
                {SOURCE_LABEL[s]}
              </Chip>
            ))}
            {tags.map((t) => (
              <Chip key={t} active={tag === t} onClick={() => setParam('stitek', tag === t ? null : t)}>
                #{t}
              </Chip>
            ))}
          </div>
        )}

        <ErrorText>{error}</ErrorText>

        {list.length === 0 && !loading ? (
          <Card>
            <p className="text-neutral-500">
              {q || tag || source ? 'Nic nenalezeno.' : 'Zatím prázdné. Ťukni na „Myšlenka“ – zápis zabere pár vteřin.'}
            </p>
          </Card>
        ) : (
          <>
            {pinned.length > 0 && (
              <section className="mb-4">
                <h2 className="mb-1.5 flex items-center gap-1 text-sm font-semibold text-neutral-500">
                  <Pin className="size-4" /> Připnuté
                </h2>
                <EntryList entries={pinned} showChapter={!chapterId} author={author} />
              </section>
            )}
            {[...byMonth.entries()].map(([m, list]) => (
              <section key={m} className="mb-4">
                <h2 className="mb-1.5 text-sm font-semibold text-neutral-500 first-letter:uppercase">{monthFmt.format(asDate(`${m}-01`))}</h2>
                <EntryList entries={list} showChapter={!chapterId} author={author} />
              </section>
            ))}
          </>
        )}
      </div>

      <ChaptersSheet open={managing} onClose={() => setManaging(false)} />
    </div>
  )
}

function ChapterLink({
  active,
  onClick,
  label,
  icon,
  count,
  shared,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: string
  count: number
  shared?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left font-medium ${
        active ? 'bg-brand-50 text-brand-800 dark:bg-brand-800/30 dark:text-brand-100' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
      }`}
    >
      <span>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shared && <Users className="size-4 text-neutral-400" aria-label="Sdílená" />}
      <span className="text-sm text-neutral-400">{count}</span>
    </button>
  )
}

function EntryList({
  entries,
  showChapter,
  author,
}: {
  entries: Entry[]
  showChapter: boolean
  author: (id: string) => { display_name: string } | undefined
}) {
  const { chapterById } = useJournal()
  const { me } = useHousehold()
  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
      {entries.map((e) => {
        const ch = chapterById.get(e.chapter_id)
        const by = e.owner_id !== me?.user_id ? author(e.owner_id) : undefined
        const firstLine = e.body.split('\n').find((l) => l.trim()) ?? ''
        return (
          <li key={e.id}>
            <Link to={`/denik/${e.id}`} className="flex gap-3 px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800">
              <span className="w-12 shrink-0 pt-0.5 text-sm text-neutral-500 tabular-nums">{dayFmt.format(asDate(e.entry_date))}</span>
              <span className="min-w-0 flex-1">
                {e.title && <span className="block font-semibold">{e.title}</span>}
                <span className={`line-clamp-2 ${e.title ? 'text-sm text-neutral-600 dark:text-neutral-400' : ''}`}>{firstLine || (e.photo_paths.length ? 'Fotka' : '')}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-neutral-500">
                  {showChapter && ch && (
                    <span>
                      {ch.icon} {ch.name}
                    </span>
                  )}
                  {e.source_type !== 'vlastni' && (
                    <span>
                      {SOURCE_LABEL[e.source_type]}
                      {e.source_ref && `: ${e.source_ref}`}
                    </span>
                  )}
                  {e.tags.map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                  {e.photo_paths.length > 0 && <ImageIcon className="size-3.5" aria-label="S fotkou" />}
                  {ch?.visibility === 'private' && showChapter && <Lock className="size-3" aria-label="Soukromé" />}
                  {by && <span>{by.display_name}</span>}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
