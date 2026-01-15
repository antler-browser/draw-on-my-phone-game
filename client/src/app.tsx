import { Routes, Route } from 'react-router-dom'
import { Home } from './routes/Home'
import { Game } from './routes/Game'
import { ConnectionBanner } from './components/ConnectionBanner'

// TypeScript declarations for Local First Auth API
declare global {
  interface Window {
    localFirstAuth?: {
      getProfileDetails(): Promise<string>
      getAvatar(): Promise<string | null>
      getAppDetails(): {
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
