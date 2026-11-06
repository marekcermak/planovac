import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router'
import { useAuth } from './auth/AuthProvider'
import { ErrorText, Splash } from './components/ui'
import { HouseholdProvider, useHousehold } from './household/HouseholdProvider'
import { AppShell } from './layout/AppShell'
import { AddPage } from './pages/AddPage'
import { CreateHouseholdPage } from './pages/CreateHouseholdPage'
import { HouseholdPage } from './pages/HouseholdPage'
import { JoinPage } from './pages/JoinPage'
import { LoginPage } from './pages/LoginPage'
import { MorePage } from './pages/MorePage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { CookbookEmptyDetail, CookbookLayout } from './pages/kitchen/CookbookPage'
import { RecipeAddPage, RecipeEditPage } from './pages/kitchen/RecipeAddPage'
import { RecipePage } from './pages/kitchen/RecipePage'
import { AiSettingsPage } from './pages/settings/AiSettingsPage'
import { CategoriesPage } from './pages/settings/CategoriesPage'
import { RecipeCategoriesPage } from './pages/settings/RecipeCategoriesPage'
import { ProductsPage } from './pages/settings/ProductsPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { ZoneEditorPage, ZonesPage } from './pages/settings/ZonesPage'
import { StockPage } from './pages/StockPage'
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
              { path: '/sklad', element: <StockPage /> },
              {
                path: '/kucharka',
                element: <CookbookLayout />,
                children: [
                  { index: true, element: <CookbookEmptyDetail /> },
                  { path: ':id', element: <RecipePage /> },
                ],
              },
              { path: '/kucharka/novy', element: <RecipeAddPage /> },
              { path: '/kucharka/:id/upravit', element: <RecipeEditPage /> },
              {
                path: '/ukoly',
                element: (
                  <PlaceholderPage title="Úkoly" phase={5} text="Sdílené a soukromé úkoly, top 3 na den." />
                ),
              },
              { path: '/pridat', element: <AddPage /> },
              { path: '/vice', element: <MorePage /> },
              { path: '/vice/domacnost', element: <HouseholdPage /> },
              { path: '/vice/nastaveni', element: <SettingsPage /> },
              { path: '/vice/nastaveni/zony', element: <ZonesPage /> },
              { path: '/vice/nastaveni/zony/:id', element: <ZoneEditorPage /> },
              { path: '/vice/nastaveni/kategorie', element: <CategoriesPage /> },
              { path: '/vice/nastaveni/produkty', element: <ProductsPage /> },
              { path: '/vice/nastaveni/kapitoly', element: <RecipeCategoriesPage /> },
              { path: '/vice/nastaveni/ai', element: <AiSettingsPage /> },
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
