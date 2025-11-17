import { useState } from 'react'

interface CreateGameProps {
  onCreateGame: (timerDuration: number) => Promise<void>
  isIRLBrowser: boolean
}

export function CreateGame({ onCreateGame, isIRLBrowser }: CreateGameProps) {
  const [timerDuration, setTimerDuration] = useState(60)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    setLoading(true)
    setError(null)

    try {
      await onCreateGame(timerDuration)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Draw On My Phone</h1>
          <p className="text-gray-600">Draw. Guess. Laugh. Repeat.</p>
        </div>

        <div className="space-y-6">
          {/* Timer Duration Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Timer (seconds per turn)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[30, 60, 90].map((duration) => (
                <button
                  key={duration}
                  onClick={() => setTimerDuration(duration)}
                  className={`
                    py-3 px-4 rounded-lg font-semibold transition-all
                    ${
                      timerDuration === duration
                        ? 'bg-rose-800 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }
                  `}
                >
                  {duration}s
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Create Game Button */}
          <button
            onClick={handleCreate}
            disabled={loading}
            className={`
              w-full py-4 px-6 rounded-lg font-bold text-white text-lg
              transition-colors
              ${
                loading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-rose-800 hover:bg-rose-900 shadow-sm'
              }
            `}
          >
            {loading ? 'Creating Game...' : 'Create Game'}
          </button>

          {/* How to Play */}
          <div className="pt-4 border-t border-gray-200">
            <p className="text-md font-bold text-gray-600 mb-2">How to Play</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Each player needs their own phone</li>
              <li>The first player who joins the game is the host and can start the game</li>
              <li>Each player selects a word, then each player takes turns drawing and guessing</li>
              <li>The game ends when you get back your phone!</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
