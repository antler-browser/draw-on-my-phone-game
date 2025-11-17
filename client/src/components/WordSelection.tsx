import { useState, useEffect } from 'react'
import { useGameStore, selectMyChain } from '../stores/gameStore'
import { getRandomWords } from '@meetup/shared'
import { GameTimer } from './GameTimer'

/**
 * WordSelection component
 * Round 0: Each player selects a word to start their chain
 */
export function WordSelection() {
  const gameState = useGameStore(state => state.gameState)
  const myChain = useGameStore(selectMyChain)
  const myDid = useGameStore(state => state.myDid)
  const [words, setWords] = useState<string[]>([])
  const [selectedWord, setSelectedWord] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)

  // Generate random words on component mount
  useEffect(() => {
    const randomWords = getRandomWords(4)
    setWords(randomWords)
  }, [])

  const handleSubmit = async () => {
    if (!gameState || !myChain || isSubmitting || hasSubmitted) return

    // Auto-select first word if timer expires and no word selected
    const finalWord = selectedWord || (words.length > 0 ? words[0] : null)
    if (!finalWord) return

    setIsSubmitting(true)

    try {
      // Save word to localStorage
      useGameStore.getState().saveSubmission(
        gameState.gameId,
        gameState.currentRound,
        'word',
        finalWord,
        myDid
      )

      // Get JWT from IRL Browser
      const jwt = await window.irlBrowser?.getProfileDetails()
      if (!jwt) throw new Error('Failed to get profile JWT')

      // Notify server of completion (no content sent)
      const response = await fetch(`/api/game/${gameState.gameId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileJwt: jwt,
          chainOwnerDid: myDid, // Round 0: selecting word for my own chain
          type: 'word',
          round: gameState.currentRound,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to submit word')
      }

      setHasSubmitted(true)
    } catch (error) {
      console.error('Submit word error:', error)
      alert('Failed to submit word. Please try again.')
      setIsSubmitting(false)
    }
  }

  const handleTimerExpire = () => {
    // Auto-submit when timer runs out
    if (!hasSubmitted && !isSubmitting) {
      handleSubmit()
    }
  }

  if (hasSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center h-screen overflow-y-auto bg-gray-50 p-6 landscape:p-4">
        <div className="bg-white rounded-xl shadow-md p-8 landscape:p-6 max-w-md landscape:max-w-2xl w-full text-center">
          <h2 className="text-2xl landscape:text-xl font-bold text-gray-800 mb-2">Word Submitted</h2>
          <p className="text-gray-600 landscape:text-sm">Waiting for other players to select their words...</p>
          <div className="mt-6 landscape:mt-4 animate-pulse">
            <div className="h-2 bg-rose-200 rounded-full"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen overflow-y-auto bg-gray-50 p-6 landscape:p-3">
      <div className="bg-white rounded-xl shadow-md p-8 landscape:p-4 max-w-md landscape:max-w-2xl w-full">
        <div className="flex items-center justify-between mb-6 landscape:mb-3">
          <h2 className="text-2xl landscape:text-xl font-bold text-gray-800">Choose Your Word</h2>
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
          onClick={handleSubmit}
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
