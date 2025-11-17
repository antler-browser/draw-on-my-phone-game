import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { App } from './app.tsx'

// Initialize IRL Browser Simulator before React renders (only in dev mode)
async function initializeApp() {
  if (import.meta.env.DEV) {
    const simulator = await import('irl-browser-simulator')
    simulator.enableIrlBrowserSimulator()
  }

  const root = createRoot(document.getElementById('app')!)
  root.render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )
}

initializeApp()
