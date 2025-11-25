import { useLocation } from 'react-router-dom'
import { useGameStore, selectConnectionStatus, selectGameId, selectHasEverConnected } from '../stores/gameStore'

interface ConnectionBannerProps {
  hideOnPaths?: string[]
}

/**
 * ConnectionBanner displays connection status
 * Shows when:
 * - A connection was previously established AND is now disconnected or reconnecting
 * - Does NOT show on initial load before any connection is made
 */
export function ConnectionBanner({ hideOnPaths = [] }: ConnectionBannerProps) {
  const location = useLocation()
  const connectionStatus = useGameStore(selectConnectionStatus)
  const hasEverConnected = useGameStore(selectHasEverConnected)
  const gameId = useGameStore(selectGameId)
  const connectWebSocket = useGameStore(state => state.connectWebSocket)

  // Don't show banner if:
  // - Current path is in hideOnPaths, OR
  // - Currently connected, OR
  // - Never connected before (initial page load)
  if (hideOnPaths.includes(location.pathname) || connectionStatus === 'connected' || !hasEverConnected) {
    return null
  }

  const handleRetry = () => {
    if (gameId) {
      const baseUrl = window.location.origin
      connectWebSocket(gameId, baseUrl)
    }
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {connectionStatus === 'disconnected' && (
        <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3"></path>
            </svg>
            <span className="font-medium">No connection</span>
          </div>
          <button
            onClick={handleRetry}
            className="bg-white text-red-600 px-3 py-1 rounded text-sm font-medium hover:bg-red-50 transition-colors"
          >
            Retry Now
          </button>
        </div>
      )}

      {connectionStatus === 'reconnecting' && (
        <div className="bg-yellow-600 text-white px-4 py-3 flex items-center gap-2">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="font-medium">Reconnecting...</span>
        </div>
      )}
    </div>
  )
}
