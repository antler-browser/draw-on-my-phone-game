import { Routes, Route } from 'react-router-dom'
import { Home } from './routes/Home'
import { Game } from './routes/Game'
import { ConnectionBanner } from './components/ConnectionBanner'

// TypeScript declarations for IRL Browser API
declare global {
  interface Window {
    irlBrowser?: {
      getProfileDetails(): Promise<string>
      getAvatar(): Promise<string | null>
      getBrowserDetails(): {
        name: string
        version: string
        platform: 'ios' | 'android' | 'browser'
        supportedPermissions: string[]
      }
      requestPermission(permission: string): Promise<boolean>
      close(): void
    }
  }
}

export function App() {
  return (
    <>
      <ConnectionBanner hideOnPaths={['/']} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/game/:gameId" element={<Game />} />
      </Routes>
    </>
  )
}
