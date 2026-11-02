import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router'
import { useAuth } from './auth/AuthProvider'
import { ErrorText, Splash } from './components/ui'
import { HouseholdProvider, useHousehold } from './household/HouseholdProvider'
import { AppShell } from './layout/AppShell'
import { CreateHouseholdPage } from './pages/CreateHouseholdPage'
import { HouseholdPage } from './pages/HouseholdPage'
import { JoinPage } from './pages/JoinPage'
import { LoginPage } from './pages/LoginPage'
import { MorePage } from './pages/MorePage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { TodayPage } from './pages/TodayPage'

/** Vyžaduje přihlášení; jinak přesměruje na přihlášení a pak zpět. */
function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Splash />
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/prihlaseni?next=${next}`} replace />
  }
  return (
    <HouseholdProvider>
      <Outlet />
    </HouseholdProvider>
  )
}

/** Vyžaduje členství v domácnosti; jinak nabídne založení. */
function RequireHousehold() {
  const { loading, household, error, refresh } = useHousehold()
  if (loading) return <Splash />
  if (error) {
    return (
      <main className="mx-auto max-w-md space-y-4 px-6 py-10">
        <ErrorText>{error}</ErrorText>
        <button className="font-medium text-brand-700" onClick={() => void refresh()}>
          Zkusit znovu
        </button>
      </main>
    )
  }
  if (!household) return <Navigate to="/zalozit" replace />
  return <Outlet />
}

function HouseholdLoaded() {
  const { loading } = useHousehold()
  return loading ? <Splash /> : <Outlet />
}

const router = createBrowserRouter([
  { path: '/prihlaseni', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <HouseholdLoaded />,
        children: [
          { path: '/zalozit', element: <CreateHouseholdPage /> },
          { path: '/pozvanka/:token', element: <JoinPage /> },
        ],
      },
      {
        element: <RequireHousehold />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <TodayPage /> },
              {
                path: '/sklad',
                element: (
                  <PlaceholderPage title="Sklad" phase={2} text="Lednice, mrazák a spíž: seznam i mapa polic." />
                ),
              },
              {
                path: '/kucharka',
                element: (
                  <PlaceholderPage
                    title="Kuchařka"
                    phase={4}
                    text="Rodinné recepty propojené se zásobami, „Můžu uvařit hned“ a „Co uvařit?“."
                  />
                ),
              },
              {
                path: '/ukoly',
                element: (
                  <PlaceholderPage title="Úkoly" phase={5} text="Sdílené a soukromé úkoly, top 3 na den." />
                ),
              },
              {
                path: '/pridat',
                element: (
                  <PlaceholderPage
                    title="Přidat"
                    phase={2}
                    text="Rychlé přidání oblíbených potravin, sken čárového kódu a režim „vybaluju nákup“."
                  />
                ),
              },
              { path: '/vice', element: <MorePage /> },
              { path: '/vice/domacnost', element: <HouseholdPage /> },
              {
                path: '/vice/nastaveni',
                element: (
                  <PlaceholderPage
                    title="Nastavení"
                    phase={2}
                    text="Zóny a mřížky, kategorie, notifikace, Živý obraz a AI přepínač."
                  />
                ),
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

export function App() {
  return <RouterProvider router={router} />
}
