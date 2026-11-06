import { X } from 'lucide-react'
import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { Button, Chip, ErrorText, Field } from '../components/ui'
import { useHabits, type Habit } from './HabitsProvider'
import { DAY_NAMES } from './schedule'

const ICONS = ['🏃', '🚴', '🏋️', '🧘', '🏊', '🚶', '📖', '💧', '🥗', '😴', '🎸', '✍️', '🧹', '💊', '✅']

/** Nový sport jako výchozí šablona (druhy si uživatel upraví). */
export const SPORT_TEMPLATE = {
  name: 'Sport',
  icon: '🏃',
  kind: 'activity',
  schedule: 'per_week',
  per_week: 3,
  days: [] as number[],
  activity_types: ['Běh', 'Kolo', 'Posilovna', 'Plavání', 'Jóga', 'Procházka'],
}

/** Založení / úprava návyku. habit = null → nový (případně podle šablony). */
export function HabitFormSheet({
  open,
  habit,
  template,
  onClose,
}: {
  open: boolean
  habit: Habit | null
  template?: Partial<typeof SPORT_TEMPLATE>
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={habit ? 'Upravit návyk' : 'Nový návyk'}>
      {open && <HabitForm habit={habit} template={template} onDone={onClose} />}
    </Sheet>
  )
}

function HabitForm({ habit, template, onDone }: { habit: Habit | null; template?: Partial<typeof SPORT_TEMPLATE>; onDone: () => void }) {
  const { saveHabit, updateHabit, removeHabit } = useHabits()
  const init: Partial<Habit> = habit ?? template ?? {}
  const [name, setName] = useState(init.name ?? '')
  const [icon, setIcon] = useState(init.icon ?? '✅')
  const [kind, setKind] = useState<string>(init.kind ?? 'check')
  const [schedule, setSchedule] = useState<string>(init.schedule ?? 'daily')
  const [days, setDays] = useState<number[]>(init.days ?? [])
  const [perWeek, setPerWeek] = useState<number>(init.per_week ?? 3)
  const [types, setTypes] = useState<string[]>(init.activity_types ?? [])
  const [newType, setNewType] = useState('')
  const [onDisplay, setOnDisplay] = useState(init.show_on_display ?? false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se uložit.')
    } finally {
      setBusy(false)
    }
  }

  function addType() {
    const t = newType.trim()
    if (t && !types.includes(t)) setTypes([...types, t])
    setNewType('')
  }

  const valid = name.trim() && (schedule !== 'days' || days.length > 0)

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void run(() =>
          saveHabit(habit?.id ?? null, {
            name: name.trim(),
            icon,
            kind,
            schedule,
            days: schedule === 'days' ? days.slice().sort() : [],
            per_week: schedule === 'per_week' ? perWeek : null,
            activity_types: kind === 'activity' ? [...types, ...(newType.trim() ? [newType.trim()] : [])] : [],
            show_on_display: onDisplay,
          }),
        )
      }}
    >
      <Field label="Název" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sport, Čtení, Voda…" />
      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Ikona</span>
        <div className="flex flex-wrap gap-1">
          {ICONS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIcon(i)}
              aria-pressed={icon === i}
              className={`flex size-11 items-center justify-center rounded-xl text-2xl ${icon === i ? 'bg-brand-50 ring-2 ring-brand-600 dark:bg-brand-800/30' : ''}`}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Jak se zapisuje</span>
        <div className="flex flex-wrap gap-2">
          <Chip active={kind === 'check'} onClick={() => setKind('check')}>
            Jen odškrtnout
          </Chip>
          <Chip active={kind === 'activity'} onClick={() => setKind('activity')}>
            Druh + poznámka
          </Chip>
        </div>
      </div>

      {kind === 'activity' && (
        <div>
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Druhy na výběr</span>
          <div className="mb-2 flex flex-wrap gap-2">
            {types.map((t) => (
              <span key={t} className="inline-flex min-h-10 items-center gap-1 rounded-full bg-neutral-100 pr-1 pl-3 text-sm dark:bg-neutral-800">
                {t}
                <button type="button" aria-label={`Odebrat ${t}`} onClick={() => setTypes(types.filter((x) => x !== t))} className="p-1.5">
                  <X className="size-4" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addType()
                }
              }}
              maxLength={40}
              placeholder="Přidat druh…"
              className="block min-h-11 flex-1 rounded-xl border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900"
            />
            <Button type="button" variant="secondary" onClick={addType} disabled={!newType.trim()}>
              Přidat
            </Button>
          </div>
        </div>
      )}

      <div>
        <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">Jak často</span>
        <div className="flex flex-wrap gap-2">
          <Chip active={schedule === 'daily'} onClick={() => setSchedule('daily')}>
            Každý den
          </Chip>
          <Chip active={schedule === 'days'} onClick={() => setSchedule('days')}>
            Vybrané dny
          </Chip>
          <Chip active={schedule === 'per_week'} onClick={() => setSchedule('per_week')}>
            X× týdně
          </Chip>
        </div>
        {schedule === 'days' && (
          <div className="mt-2 flex gap-1">
            {DAY_NAMES.map((d, i) => (
              <Chip
                key={d}
                className="px-3"
                active={days.includes(i + 1)}
                onClick={() => setDays(days.includes(i + 1) ? days.filter((x) => x !== i + 1) : [...days, i + 1])}
              >
                {d}
              </Chip>
            ))}
          </div>
        )}
        {schedule === 'per_week' && (
          <div className="mt-2 flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <Chip key={n} className="px-3.5" active={perWeek === n} onClick={() => setPerWeek(n)}>
                {n}×
              </Chip>
            ))}
          </div>
        )}
      </div>

      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="size-5 accent-brand-700" checked={onDisplay} onChange={(e) => setOnDisplay(e.target.checked)} />
        <span>
          Ukazovat na displeji <span className="text-sm text-neutral-500">(Živý obraz – uvidí ho celá domácnost)</span>
        </span>
      </label>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy || !valid}>
        {habit ? 'Uložit' : 'Založit návyk'}
      </Button>
      {habit && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="flex-1" disabled={busy} onClick={() => void run(() => updateHabit(habit.id, { archived: !habit.archived }))}>
            {habit.archived ? 'Obnovit' : 'Archivovat'}
          </Button>
          {confirmDelete ? (
            <Button type="button" variant="danger" disabled={busy} onClick={() => void run(() => removeHabit(habit.id))}>
              Smazat i s historií
            </Button>
          ) : (
            <Button type="button" variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Smazat
            </Button>
          )}
        </div>
      )}
      {habit && <p className="text-sm text-neutral-500">Archivovaný návyk zmizí z Dnes, historie zůstane.</p>}
    </form>
  )
}
