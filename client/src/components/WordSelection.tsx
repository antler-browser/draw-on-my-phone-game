import { useState, useEffect } from 'react'
import { useGameStore, selectMyChain, selectPlayers, selectCurrentRound } from '../stores/gameStore'
import { getRandomWords } from '@internal/shared'
import { GameTimer } from './GameTimer'
import { Avatar } from './Avatar'

type Phase = 'word' | 'submitted'

/**
 * WordSelection component
 * Round 0: Each player selects a word to start their chain
 */
export function WordSelection() {
  const gameState = useGameStore(state => state.gameState)
  const myChain = useGameStore(selectMyChain)
  const myDid = useGameStore(state => state.myDid)
  const players = useGameStore(selectPlayers)
  const currentRound = useGameStore(selectCurrentRound)

  const [words, setWords] = useState<string[]>([])
  const [selectedWord, setSelectedWord] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [phase, setPhase] = useState<Phase>('word')

  // Get current holder (for round 0, this is always the chain owner)
  const getCurrentHolder = () => {
    const chainOwner = players.find(p => p.did === myDid)
    if (!chainOwner || players.length === 0) return null

    const currentHolderPosition = (chainOwner.turnPosition + currentRound) % players.length
    return players.find(p => p.turnPosition === currentHolderPosition) || null
  }

  const currentHolder = getCurrentHolder()

  // Generate random words on component mount
  useEffect(() => {
    const randomWords = getRandomWords(4)
    setWords(randomWords)
  }, [])

  // Handle word selection
  const handleWordSubmit = async () => {
    if (!gameState || !myChain || isSubmitting) return

    // Auto-select first word if timer expires and no word selected
    const finalWord = selectedWord || (words.length > 0 ? words[0] : null)
    if (!finalWord) return

    // Save word to localStorage
    useGameStore.getState().saveSubmission(
      gameState.gameId,
      gameState.currentRound,
      'word',
      finalWord,
      myDid
    )

    setIsSubmitting(true)
    setPhase('submitted')

    // Fire-and-forget POST to server
    window.irlBrowser?.getProfileDetails().then(jwt => {
      if (!jwt) {
        console.log('No JWT available for submission POST')
        return
      }

      fetch(`/api/game/${gameState.gameId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileJwt: jwt,
          chainOwnerDid: myDid,
          type: 'word',
          round: gameState.currentRound,
        }),
      }).catch(err => {
        console.log('Word submission POST failed (content saved locally):', err)
      })
    }).catch(err => {
      console.log('Failed to get JWT for submission POST:', err)
    })
  }

  const handleTimerExpire = () => {
    // Auto-submit word selection when timer expires
    if (phase === 'word' && !isSubmitting) {
      handleWordSubmit()
    }
  }

  // Submitted state - show waiting message
  if (phase === 'submitted') {
    return (
      <div className="flex flex-col items-center justify-center h-screen overflow-y-auto bg-gray-50 p-6 landscape:p-4">
        <div className="bg-white rounded-xl shadow-md p-8 landscape:p-6 max-w-md landscape:max-w-2xl w-full text-center">
          <h2 className="text-2xl landscape:text-xl font-bold text-gray-800 mb-2">
            Word Submitted
          </h2>

          <p className="text-gray-600 landscape:text-sm">
            Waiting for other players to select their words...
          </p>
          <div className="mt-6 landscape:mt-4 animate-pulse">
            <div className="h-2 bg-rose-200 rounded-full"></div>
          </div>
        </div>
      </div>
    )
  }

  // Word selection phase
  return (
    <div className="flex flex-col items-center justify-center h-screen overflow-y-auto bg-gray-50 p-6 landscape:p-3">
      <div className="bg-white rounded-xl shadow-md p-8 landscape:p-4 max-w-md landscape:max-w-2xl w-full">
        <div className="flex items-center justify-between mb-6 landscape:mb-3">
          <div className="flex items-center gap-2">
            {currentHolder && <Avatar avatar={currentHolder.avatar} name={currentHolder.name} size="sm" />}
            <h2 className="text-xl landscape:text-lg font-bold text-gray-800">
              Choose Your Word
            </h2>
          </div>
          <GameTimer onExpire={handleTimerExpire} />
        </div>

        <p className="text-gray-600 mb-6 landscape:mb-3 landscape:text-sm">
          Select a word to start your chain. Other players will try to draw and guess it!
        </p>

        <div className="grid grid-cols-1 landscape:grid-cols-2 gap-3 landscape:gap-2 mb-6 landscape:mb-3">
          {words.map((word) => (
            <button
              key={word}
              onClick={() => setSelectedWord(word)}
              className={`
                p-4 landscape:p-2 rounded-lg text-lg landscape:text-base font-semibold transition-colors
                ${selectedWord === word
                  ? 'bg-rose-800 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                }
              `}
            >
              {word}
            </button>
          ))}
        </div>

        <button
          onClick={handleWordSubmit}
          disabled={!selectedWord || isSubmitting}
          className={`
            w-full py-4 landscape:py-2 rounded-lg font-bold text-lg landscape:text-base transition-colors
            ${selectedWord && !isSubmitting
              ? 'bg-rose-800 text-white hover:bg-rose-900 shadow-sm'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Word'}
        </button>
      </div>
    </div>
  )
}
