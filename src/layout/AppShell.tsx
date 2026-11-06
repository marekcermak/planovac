import { BookOpen, CalendarCheck, House, Menu, NotebookPen, Plus, Refrigerator, type LucideIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { ToastProvider } from '../components/Toast'
import { Avatar } from '../components/ui'
import { useHousehold } from '../household/HouseholdProvider'
import { KitchenProvider } from '../kitchen/KitchenProvider'
import { AiProvider } from '../lib/AiProvider'
import { ShoppingProvider, useShopping } from '../shopping/ShoppingProvider'
import { StockProvider } from '../stock/StockProvider'
import { TasksProvider } from '../tasks/TasksProvider'
import { HabitsProvider } from '../habits/HabitsProvider'
import { JournalProvider } from '../journal/JournalProvider'

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; desktopOnly?: boolean }

const NAV: NavItem[] = [
  { to: '/', label: 'Dnes', icon: House, end: true },
  { to: '/sklad', label: 'Sklad', icon: Refrigerator },
  { to: '/kucharka', label: 'Kuchařka', icon: BookOpen },
  { to: '/planovac', label: 'Plánovač', icon: CalendarCheck },
  // Na mobilu je Deník ve „Více“ a na Dnes (spodní lišta má jen 5 míst).
  { to: '/denik', label: 'Deník', icon: NotebookPen, desktopOnly: true },
  { to: '/vice', label: 'Více', icon: Menu },
]

/**
 * Mobil: obsah + spodní navigace + plovoucí „+“.
 * Od 1024 px (lg): boční menu vlevo s tlačítkem „+ Přidat“ (SPEC 5.1).
 */
export function AppShell() {
  return (
    <ToastProvider>
      <AiProvider>
        <StockProvider>
          <KitchenProvider>
            <ShoppingProvider>
              <TasksProvider>
                <HabitsProvider>
                  <JournalProvider>
                    <Shell />
                  </JournalProvider>
                </HabitsProvider>
              </TasksProvider>
            </ShoppingProvider>
          </KitchenProvider>
        </StockProvider>
      </AiProvider>
    </ToastProvider>
  )
}

function Shell() {
  const { household, me } = useHousehold()
  const navigate = useNavigate()
  const shoppingCount = useShopping().open.length
  const badge = (to: string) =>
    to === '/planovac' && shoppingCount > 0 ? (
      <span className="rounded-full bg-brand-700 px-1.5 text-[10px] leading-4 font-semibold text-white">{shoppingCount}</span>
    ) : null

  // PC: „N“ = přidat položku do skladu, „R“ = nový recept, „T“ = nový úkol (SPEC 5.1).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return
      if (document.querySelector('[role="dialog"]')) return
      const target = { n: '/pridat', r: '/kucharka/novy', t: '/planovac/ukoly?novy=1' }[e.key.toLowerCase()]
      if (target) {
        e.preventDefault()
        navigate(target)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Boční menu – desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-neutral-200 bg-white px-3 py-4 lg:flex dark:border-neutral-800 dark:bg-neutral-900">
        <Link to="/" className="mb-5 flex items-center gap-2 px-2">
          <img src="/favicon.svg" alt="" className="size-8" />
          <span className="text-lg font-bold">Plánovač</span>
        </Link>
        <Link
          to="/pridat"
          className="mb-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 font-medium text-white hover:bg-brand-800"
        >
          <Plus className="size-5" /> Přidat
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium ${
                  isActive
                    ? 'bg-brand-50 text-brand-800 dark:bg-brand-800/30 dark:text-brand-100'
                    : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`
              }
            >
              <Icon className="size-5" /> <span className="flex-1">{label}</span>
              {badge(to)}
            </NavLink>
          ))}
        </nav>
        {me && (
          <div className="mt-auto flex items-center gap-3 px-2 pt-4">
            <Avatar name={me.display_name} color={me.color} size="sm" />
            <div className="min-w-0 text-sm">
              <div className="truncate font-medium">{me.display_name}</div>
              <div className="truncate text-neutral-500">{household?.name}</div>
            </div>
          </div>
        )}
      </aside>

      {/* Obsah */}
      <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-8 lg:pt-8 lg:pb-8">
        <Outlet />
      </main>

      {/* Plovoucí „+“ – mobil */}
      <Link
        to="/pridat"
        aria-label="Přidat"
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] flex size-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg active:scale-95 lg:hidden"
      >
        <Plus className="size-7" />
      </Link>

      {/* Spodní navigace – mobil */}
      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-neutral-800 dark:bg-neutral-900/95">
        {NAV.filter((n) => !n.desktopOnly).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                isActive ? 'text-brand-700 dark:text-brand-500' : 'text-neutral-500'
              }`
            }
          >
            <span className="relative">
              <Icon className="size-6" />
              <span className="absolute -top-1.5 left-4">{badge(to)}</span>
            </span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
