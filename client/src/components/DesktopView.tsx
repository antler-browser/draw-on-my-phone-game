import { GameLobby } from './GameLobby'
import type { ServerGameState } from '@internal/shared'

interface DesktopViewProps {
  gameState: ServerGameState | null
  gameId: string
  onStartGame: () => Promise<void>
}

export function DesktopView({ gameState, gameId, onStartGame }: DesktopViewProps) {
  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-800 text-center">
          <p className="text-xl font-semibold">Loading game...</p>
        </div>
      </div>
    )
  }

  if (gameState.status === 'lobby') {
    return (
      <GameLobby
        gameId={gameId}
        onStartGame={onStartGame}
      />
    )
  }

  if (gameState.status === 'playing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-800 text-center">
          <p className="text-xl font-semibold">Game is in progress!</p>
        </div>
      </div>
    )
  }

  if (gameState.status === 'finished') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-800 text-center">
          <p className="text-xl font-semibold">Game is finished!</p>
        </div>
      </div>
    )
  }

  return null
}

