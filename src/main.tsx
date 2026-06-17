import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import { App } from './App'
import { StoreProvider } from './state/store'
import { AuthProvider } from './state/auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </AuthProvider>
    {/* Vercel Web Analytics — privacy-friendly, cookieless page-view counts. */}
    <Analytics />
  </StrictMode>,
)
