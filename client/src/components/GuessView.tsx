import { useState, useEffect, useRef } from 'react'
import CanvasDraw from 'react-canvas-draw'
import { useGameStore, selectMyChain, selectCurrentRound, selectPlayers } from '../stores/gameStore'
import { getCurrentHolderPosition, getNextChainHolder } from '@internal/shared'
import { GameTimer } from './GameTimer'
import { Avatar } from './Avatar'

/**
 * GuessView component
 * Player views previous drawing and guesses what it is
 */
export function GuessView() {
  const canvasRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const instructionRef = useRef<HTMLParagraphElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const gameState = useGameStore(state => state.gameState)
  const myChain = useGameStore(selectMyChain)
  const currentRound = useGameStore(selectCurrentRound)
  const myDid = useGameStore(state => state.myDid)
  const players = useGameStore(selectPlayers)
  const getDrawing = useGameStore(state => state.getDrawing)

  // Calculate who is currently holding this chain (the actual contributor)
  // myDid is the device owner (chain owner), but someone else may be using the phone
  const getCurrentHolder = () => {
    const chainOwner = players.find(p => p.did === myDid)
    if (!chainOwner || players.length === 0) return null

    // Use shared game logic to account for Round 1 no-rotation for even players
    const currentHolderPosition = getCurrentHolderPosition(
      chainOwner.turnPosition,
      currentRound,
      players.length
    )
    return players.find(p => p.turnPosition === currentHolderPosition) || null
  }

  const currentHolder = getCurrentHolder()
  const getCurrentHolderDid = (): string => currentHolder?.did || myDid

  // Calculate who should receive the phone next
  const getNextPlayer = () => {
    const chainOwner = players.find(p => p.did === myDid)
    if (!chainOwner || players.length === 0) return null

    // Use shared game logic to get current holder position
    const currentHolderPosition = getCurrentHolderPosition(
      chainOwner.turnPosition,
      currentRound,
      players.length
    )
    const nextHolderPosition = getNextChainHolder(currentHolderPosition, players.length)
    return players.find(p => p.turnPosition === nextHolderPosition) || null
  }

  const nextPlayer = getNextPlayer()

  const [guess, setGuess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 400 })

  // Calculate optimal canvas size to fill available space
  useEffect(() => {
    const updateCanvasSize = () => {
      if (!cardRef.current) return

      const viewportHeight = window.innerHeight

      // Use actual card width (accounts for all padding automatically)
      const availableWidth = cardRef.current.clientWidth

      // Calculate available height by subtracting all other elements
      let totalOtherHeight = 0

      if (headerRef.current) totalOtherHeight += headerRef.current.offsetHeight
      if (instructionRef.current) totalOtherHeight += instructionRef.current.offsetHeight
      if (inputRef.current) totalOtherHeight += inputRef.current.offsetHeight
      if (buttonRef.current) totalOtherHeight += buttonRef.current.offsetHeight

      // Add padding/margins buffer
      totalOtherHeight += 50

      const availableHeight = viewportHeight - totalOtherHeight
      const height = Math.max(180, availableHeight)

      setCanvasSize({ width: availableWidth, height })
    }

    // Initial update after a short delay to ensure refs are populated
    const timer = setTimeout(updateCanvasSize, 100)

    window.addEventListener('resize', updateCanvasSize)
    window.addEventListener('orientationchange', updateCanvasSize)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateCanvasSize)
      window.removeEventListener('orientationchange', updateCanvasSize)
    }
  }, [])

  // Load previous drawing from localStorage with original dimensions
  useEffect(() => {
    if (gameState && currentRound > 0) {
      const previousDrawing = getDrawing(gameState.gameId, currentRound - 1)
      if (previousDrawing) {
        // Restore the exact canvas dimensions from when the drawing was created
        if (previousDrawing.width && previousDrawing.height) {
          setCanvasSize({ width: previousDrawing.width, height: previousDrawing.height })
        }

        // Load the drawing data after dimensions are set
        if (canvasRef.current && previousDrawing.drawing) {
          // Use setTimeout to ensure canvas is resized before loading data
          setTimeout(() => {
            if (canvasRef.current) {
              canvasRef.current.loadSaveData(previousDrawing.drawing)
            }
          }, 50)
        }
      }
    }
  }, [gameState, currentRound, getDrawing])

  const handleSubmit = async () => {
    if (!gameState || !myChain || isSubmitting || hasSubmitted) return

    // Use current guess or default to '???' if auto-submitting with no text
    const finalGuess = guess.trim() || '???'
    if (!finalGuess) return

    setIsSubmitting(true)

    // Save guess to localStorage (always succeeds)
    // Use the calculated current holder (the person actually guessing), not the device owner
    useGameStore.getState().saveSubmission(
      gameState.gameId,
      gameState.currentRound,
      'guess',
      finalGuess,
      getCurrentHolderDid()
    )

    // Immediately mark as submitted (optimistic UI)
    setHasSubmitted(true)

    // Fire-and-forget POST to server (best-effort, don't wait)
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
          chainOwnerDid: myChain.did,
          type: 'guess',
          round: gameState.currentRound,
        }),
      }).catch(err => {
        console.log('Guess submission POST failed (content saved locally):', err)
      })
    }).catch(err => {
      console.log('Failed to get JWT for submission POST:', err)
    })
  }

  const handleTimerExpire = () => {
    // Auto-submit when timer runs out
    if (!hasSubmitted && !isSubmitting) {
      handleSubmit()
    }
  }

  if (hasSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center h-screen overflow-y-auto bg-gray-50 p-6 landscape:p-3">
        <div className="bg-white rounded-xl shadow-md p-8 landscape:p-4 max-w-md w-full text-center">
          <h2 className="text-2xl landscape:text-xl font-bold text-gray-800 mb-2">Guess Submitted</h2>

          {nextPlayer && (
            <div className="my-4">
              <p className="text-gray-600 landscape:text-sm mb-3">Pass your phone to:</p>
              <div className="flex flex-col items-center">
                <Avatar avatar={nextPlayer.avatar} name={nextPlayer.name} size="md" />
                <p className="mt-2 text-lg font-bold text-gray-800">
                  {nextPlayer.name || 'Next Player'}
                </p>
              </div>
            </div>
          )}

          <p className="text-gray-600 landscape:text-sm">Waiting for other players...</p>
          <div className="mt-6 landscape:mt-4 animate-pulse">
            <div className="h-2 bg-rose-200 rounded-full"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col items-center justify-center h-screen overflow-y-auto bg-gray-50 p-6 landscape:p-2">
      <div ref={cardRef} className="bg-white rounded-xl shadow-md p-6 landscape:p-3 w-full">
        <div ref={headerRef} className="flex items-center justify-between mb-4 landscape:mb-2">
          <div className="flex items-center gap-2">
            {currentHolder && <Avatar avatar={currentHolder.avatar} name={currentHolder.name} size="sm" />}
            <h2 className="text-xl landscape:text-lg font-bold text-gray-800">
              {currentHolder?.name ? `${currentHolder.name}'s turn to Guess!` : 'What is this?'}
            </h2>
          </div>
          <GameTimer onExpire={handleTimerExpire} />
        </div>

        <p ref={instructionRef} className="text-gray-600 mb-4 landscape:mb-2 landscape:text-xs text-center">
          Look at the drawing below and type what you think it is!
        </p>

        {/* Canvas (read-only) */}
        <div
          className="border-2 border-gray-300 rounded-lg overflow-hidden mb-4 landscape:mb-2 relative"
          style={{ width: canvasSize.width, height: canvasSize.height }}
        >
          <CanvasDraw
            ref={canvasRef}
            disabled
            canvasWidth={canvasSize.width}
            canvasHeight={canvasSize.height}
            hideGrid
            hideInterface
          />
        </div>

        {/* Guess input */}
        <div ref={inputRef} className="mb-4 landscape:mb-2">
          <input
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && guess.trim()) {
                handleSubmit()
              }
            }}
            placeholder="Type your guess..."
            className="w-full px-4 py-3 landscape:px-2 landscape:py-1 text-lg landscape:text-sm border-2 border-gray-300 rounded-lg focus:border-rose-800 focus:outline-none"
            autoFocus
          />
        </div>

        <button
          ref={buttonRef}
          onClick={handleSubmit}
          disabled={!guess.trim() || isSubmitting}
          className={`
            w-full py-3 landscape:py-2 rounded-lg font-bold text-lg landscape:text-sm transition-colors
            ${guess.trim() && !isSubmitting
              ? 'bg-rose-800 text-white hover:bg-rose-900 shadow-sm'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Guess'}
        </button>
      </div>
    </div>
  )
}
