import { Routes, Route } from 'react-router-dom'
import { Home } from './routes/Home'
import { Game } from './routes/Game'

// TypeScript declarations for IRL Browser API
declare global {
  interface Window {
    irlBrowser?: {
      getProfileDetails(): Promise<string>
      getAvatar(): Promise<string | null>
      getBrowserDetails(): {
        name: string
        version: string
        platform: 'ios' | 'android'
        supportedPermissions: string[]
      }
      requestPermission(permission: string): Promise<boolean>
      close(): void
    }
  }
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/game/:gameId" element={<Game />} />
    </Routes>
  )
}
