import { ChevronRight, LogOut, Settings, Users, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { signOut, useAuth } from '../auth/AuthProvider'
import { InstallHint } from '../components/InstallHint'
import { PageHeader } from '../components/ui'

function Row({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-14 items-center gap-3 px-4 hover:bg-neutral-50 dark:hover:bg-neutral-800"
    >
      <Icon className="size-5 text-neutral-500" />
      <span className="flex-1 font-medium">{label}</span>
      <ChevronRight className="size-5 text-neutral-400" />
    </Link>
  )
}

export function MorePage() {
  const { session } = useAuth()

  return (
    <div className="max-w-xl">
      <PageHeader title="Více" subtitle={session?.user.email} />
      <div className="mb-4 divide-y divide-neutral-200 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200 dark:divide-neutral-800 dark:bg-neutral-900 dark:ring-neutral-800">
        <Row to="/vice/domacnost" icon={Users} label="Domácnost a členové" />
        <Row to="/vice/nastaveni" icon={Settings} label="Nastavení" />
      </div>
      <div className="mb-4">
        <InstallHint always />
      </div>
      <button
        onClick={() => void signOut()}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white px-4 font-medium text-red-700 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:text-red-400 dark:ring-neutral-800"
      >
        <LogOut className="size-5" /> Odhlásit se
      </button>
      <p className="mt-6 text-center text-xs text-neutral-400">Plánovač {__APP_VERSION__}</p>
    </div>
  )
}
