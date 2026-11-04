import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthProvider } from './auth/AuthProvider'
import { handoffUrl } from './lib/supabase'
import { HandoffPage } from './pages/HandoffPage'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {handoffUrl ? (
      <HandoffPage url={handoffUrl} />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
)
