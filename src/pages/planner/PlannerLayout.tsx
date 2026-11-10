import { NavLink, Outlet } from 'react-router'
import { useShopping } from '../../shopping/ShoppingProvider'

/** Plánovač: úkoly (výchozí), nákup, jídlo, návyky, radost a chata – přepínané záložkami. */
export function PlannerLayout() {
  const { open } = useShopping()
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-10 flex-1 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm whitespace-nowrap sm:px-4 font-medium lg:flex-none ${
      isActive ? 'bg-white shadow-sm dark:bg-neutral-700' : 'text-neutral-600 dark:text-neutral-400'
    }`
  return (
    <div className="max-w-2xl">
      <h1 className="mb-3 text-2xl font-bold tracking-tight">Plánovač</h1>
      <nav className="mb-4 flex overflow-x-auto rounded-xl bg-neutral-100 p-1 [scrollbar-width:none] dark:bg-neutral-800">
        <NavLink to="/planovac/ukoly" className={tab}>
          Úkoly
        </NavLink>
        <NavLink to="/planovac/nakup" className={tab}>
          Nákup
          {open.length > 0 && <span className="rounded-full bg-brand-700 px-1.5 text-xs text-white">{open.length}</span>}
        </NavLink>
        <NavLink to="/planovac/jidlo" className={tab}>
          Jídlo
        </NavLink>
        <NavLink to="/planovac/navyky" className={tab}>
          Návyky
        </NavLink>
        <NavLink to="/planovac/radost" className={tab}>
          Radost
        </NavLink>
        <NavLink to="/planovac/chata" className={tab}>
          Chata
        </NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
