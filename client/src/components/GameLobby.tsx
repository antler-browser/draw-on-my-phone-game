import { Avatar } from './Avatar'
import { QRCodePanel } from './QRCodePanel'
import { useGameStore, selectIsHost, selectPlayers } from '../stores/gameStore'

interface GameLobbyProps {
  gameId: string
  onStartGame: () => Promise<void>
}

export function GameLobby({ gameId, onStartGame }: GameLobbyProps) {
  const isHost = useGameStore(selectIsHost)
  const players = useGameStore(selectPlayers)
  const gameState = useGameStore(state => state.gameState)

  const playerCount = players.length
  const canStart = playerCount >= 3

  const handleStart = async () => {
    try {
      await onStartGame()
    } catch (err) {
      console.error('Failed to start game:', err)
    }
  }

  // Construct the join URL for QR code
  const joinUrl = `${window.location.origin}${window.location.pathname}?gameId=${gameId}`

  return (
    <div className="min-h-screen bg-gray-50 flex items-center">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row gap-6 max-w-6xl mx-auto">
          {/* QR Code Panel (hidden on mobile, visible on desktop) */}
          <div className="hidden md:block">
            <QRCodePanel url={joinUrl} />
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <div className="text-center mb-6">
              <div className="inline-block text-2xl font-bold text-rose-800 tracking-wider font-mono">
                Game Code: {gameId}
              </div>
            </div>

            {/* Player List */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">
                Players
              </h2>

              {playerCount === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>Waiting for players to join...</p>
                  <p className="text-sm mt-2">Scan the QR code with your phone</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {players.map((player, index) => (
                    <div
                      key={player.did}
                      className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200"
                    >
                      <Avatar
                        avatar={player.avatar}
                        name={player.name}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 truncate">
                          {player.name}
                          {gameState?.hostDid && player.did === gameState.hostDid && (
                            <span className="ml-2 text-xs bg-rose-800 text-white px-2 py-1 rounded-full font-medium">
                              Host
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Game Controls */}
            <div className="bg-white rounded-xl shadow-md p-6">
              {isHost ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Ready to Start?
                  </h3>

                  {/* Player Count Validation */}
                  {playerCount < 3 && (
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
                      <p className="font-medium">Need more players</p>
                      <p>You need at least 3 players to start</p>
                    </div>
                  )}

                  {/* Start Button */}
                  <button
                    onClick={handleStart}
                    disabled={!canStart}
                    className={`
                      w-full py-4 px-6 rounded-lg font-bold text-white text-lg
                      transition-colors
                      ${
                        canStart
                          ? 'bg-rose-800 hover:bg-rose-900 shadow-sm'
                          : 'bg-gray-400 cursor-not-allowed'
                      }
                    `}
                  >
                    {canStart ? 'Start Game' : 'Waiting for Players'}
                  </button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="inline-block p-4 bg-rose-50 rounded-full mb-4">
                    <svg
                      className="w-12 h-12 text-rose-800 animate-pulse"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    Waiting for Host
                  </h3>
                  <p className="text-gray-600 text-sm">
                    The host will start the game when everyone is ready
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile QR Code (shown on mobile) */}
        <div className="md:hidden mt-6">
          <QRCodePanel url={joinUrl} />
        </div>
      </div>
    </div>
  )
}
