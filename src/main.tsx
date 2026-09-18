import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import './main.css'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import { AppContextProvider } from '@/contexts/AppContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppContextProvider>
          <TooltipProvider delayDuration={250}>
            <App />
            <Toaster />
          </TooltipProvider>
        </AppContextProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
