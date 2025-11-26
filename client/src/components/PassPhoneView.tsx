import { useChainInfo } from '../hooks/useChainInfo'
import { Avatar } from './Avatar'

/**
 * PassPhoneView component
 * Interstitial screen shown after submitting, before next task
 * Shows which player to pass the phone to
 */
export function PassPhoneView({ onReady }: { onReady: () => void }) {
  // Use centralized hook for chain info (handles even-player special case)
  const { nextHolder: nextPlayer } = useChainInfo()

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6 landscape:p-3">
      <div className="bg-white rounded-xl shadow-md p-8 landscape:p-4 max-w-md landscape:max-w-2xl w-full text-center">
        <h2 className="text-3xl landscape:text-xl font-bold text-gray-800 mb-4 landscape:mb-2">Round Complete</h2>

        {nextPlayer ? (
          <div className="mb-6 landscape:mb-4">
            <p className="text-lg landscape:text-sm text-gray-600 mb-4 landscape:mb-2">
              Pass your phone to:
            </p>
            <div className="flex flex-col items-center">
              <Avatar avatar={nextPlayer.avatar} name={nextPlayer.name} size="md" />
              <p className="mt-2 text-xl landscape:text-lg font-bold text-gray-800">
                {nextPlayer.name || 'Next Player'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-lg landscape:text-sm text-gray-600 mb-8 landscape:mb-4">
            Great job! The round is complete. Get ready for the next round!
          </p>
        )}

        <button
          onClick={onReady}
          className="w-full py-4 landscape:py-2 rounded-lg font-bold text-lg landscape:text-base bg-rose-800 text-white hover:bg-rose-900 shadow-sm transition-colors"
        >
          I'm Ready
        </button>
      </div>
    </div>
  )
}
