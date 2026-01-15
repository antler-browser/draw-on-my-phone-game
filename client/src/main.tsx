import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { App } from './app.tsx'

// Initialize Local First Auth Simulator before React renders (only in dev mode)
async function initializeApp() {
  if (import.meta.env.DEV) {
    const simulator = await import('local-first-auth-simulator')
    simulator.enableLocalFirstAuthSimulator()
  }

  const root = createRoot(document.getElementById('app')!)
  root.render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )
}

initializeApp()
