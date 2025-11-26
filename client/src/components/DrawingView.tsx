import { useRef, useState, useEffect, useCallback } from 'react'
import CanvasDraw from 'react-canvas-draw'
import { ArrowUturnLeftIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useGameStore, selectMyChainOwner, selectCurrentRound } from '../stores/gameStore'
import { useChainInfo } from '../hooks/useChainInfo'
import { GameTimer } from './GameTimer'
import { Avatar } from './Avatar'

/**
 * DrawingView component
 * Player draws a picture based on the previous guess or word
 */
export function DrawingView() {
  const canvasRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const gameState = useGameStore(state => state.gameState)
  const myChainOwner = useGameStore(selectMyChainOwner)
  const currentRound = useGameStore(selectCurrentRound)
  const saveDrawing = useGameStore(state => state.saveDrawing)
  const getSubmission = useGameStore(state => state.getSubmission)

  // Use centralized hook for chain info (handles even-player special case)
  const { currentHolder, nextHolder: nextPlayer, currentHolderDid } = useChainInfo()

  const [brushColor, setBrushColor] = useState('#000000')
  const brushRadius = 3 // Fixed to Medium brush size
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [prompt, setPrompt] = useState<string>('Loading...')
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 400 })

  // Capture the current holder DID and round at mount to prevent race conditions
  // with server-side auto-submit advancing the round before client timer fires
  const [roundSnapshot] = useState(() => ({
    holderDid: currentHolderDid,
    round: gameState?.currentRound ?? 0
  }))

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
      if (promptRef.current) totalOtherHeight += promptRef.current.offsetHeight
      if (toolsRef.current) totalOtherHeight += toolsRef.current.offsetHeight
      if (buttonRef.current) totalOtherHeight += buttonRef.current.offsetHeight

      // Add padding/margins buffer
      totalOtherHeight += 60

      const availableHeight = viewportHeight - totalOtherHeight
      const height = Math.max(200, availableHeight)

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
  }, [prompt])

  // Load the previous word/guess from localStorage
  useEffect(() => {
    if (!gameState || !myChainOwner || currentRound < 1) {
      return
    }

    // Get previous submission from localStorage
    const previousRound = currentRound - 1
    const previousSubmission = getSubmission(gameState.gameId, previousRound)

    if (previousSubmission && previousSubmission.content) {
      setPrompt(previousSubmission.content)
    } else {
      setPrompt('Draw what you see!')
    }
  }, [gameState, myChainOwner, currentRound, getSubmission])

  const handleClear = () => {
    if (canvasRef.current) {
      canvasRef.current.clear()
    }
  }

  const handleUndo = () => {
    if (canvasRef.current) {
      canvasRef.current.undo()
    }
  }

  const handleSubmit = useCallback(async () => {
    if (!canvasRef.current || !gameState || !myChainOwner || isSubmitting || hasSubmitted) return

    setIsSubmitting(true)

    // Get canvas data
    const saveData = canvasRef.current.getSaveData()

    // Save drawing canvas with dimensions to localStorage (always succeeds)
    // Use the round captured at mount to prevent race conditions
    saveDrawing(gameState.gameId, roundSnapshot.round, {
      drawing: saveData,
      width: canvasSize.width,
      height: canvasSize.height
    })

    // Save drawing submission metadata to localStorage
    // Use the holder DID captured at mount to prevent race conditions
    // (server may advance round before client timer fires)
    useGameStore.getState().saveSubmission(
      gameState.gameId,
      roundSnapshot.round,
      'draw',
      null, // content is null for drawings
      roundSnapshot.holderDid
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
          chainOwnerDid: myChainOwner.did,
          type: 'draw',
          round: roundSnapshot.round,
        }),
      }).catch(err => {
        console.log('Drawing submission POST failed (content saved locally):', err)
      })
    }).catch(err => {
      console.log('Failed to get JWT for submission POST:', err)
    })
  }, [gameState, myChainOwner, isSubmitting, hasSubmitted, canvasSize, roundSnapshot, saveDrawing])

  // Auto-submit when round advances (other players finished before our timer)
  useEffect(() => {
    const currentServerRound = gameState?.currentRound ?? 0
    if (currentServerRound > roundSnapshot.round && !hasSubmitted && !isSubmitting) {
      handleSubmit()
    }
  }, [gameState?.currentRound, roundSnapshot.round, hasSubmitted, isSubmitting, handleSubmit])

  // Save on unmount if not already submitted (captures current canvas state)
  useEffect(() => {
    return () => {
      if (!useGameStore.getState().getSubmission(gameState?.gameId || '', roundSnapshot.round)) {
        if (canvasRef.current && gameState) {
          const saveData = canvasRef.current.getSaveData()
          useGameStore.getState().saveDrawing(gameState.gameId, roundSnapshot.round, {
            drawing: saveData,
            width: canvasSize.width,
            height: canvasSize.height
          })
          useGameStore.getState().saveSubmission(
            gameState.gameId,
            roundSnapshot.round,
            'draw',
            null,
            roundSnapshot.holderDid
          )
        }
      }
    }
  }, [])

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
          <h2 className="text-2xl landscape:text-xl font-bold text-gray-800 mb-2">Drawing Submitted</h2>

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
              {currentHolder?.name ? `${currentHolder.name}'s turn to Draw!` : 'Draw It!'}
            </h2>
          </div>
          <GameTimer onExpire={handleTimerExpire} />
        </div>

        <div ref={promptRef} className="bg-rose-50 border border-rose-200 rounded-lg p-4 landscape:p-2 mb-4 landscape:mb-2 text-center">
          <p className="text-lg landscape:text-sm font-semibold text-gray-800">{prompt}</p>
        </div>

        {/* Canvas */}
        <div
          className="border-2 border-gray-300 rounded-lg overflow-hidden mb-4 landscape:mb-2 relative"
          style={{ width: canvasSize.width, height: canvasSize.height }}
        >
          <CanvasDraw
            ref={canvasRef}
            brushColor={brushColor}
            brushRadius={brushRadius}
            canvasWidth={canvasSize.width}
            canvasHeight={canvasSize.height}
            lazyRadius={0}
            hideGrid
          />
        </div>

        {/* Drawing tools */}
        <div ref={toolsRef} className="flex items-center justify-center gap-4 mb-4 landscape:mb-2">
          <div className="flex gap-2 justify-center">
            {['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'].map(color => (
              <button
                key={color}
                onClick={() => setBrushColor(color)}
                className={`w-8 h-8 landscape:w-7 landscape:h-7 rounded-full border-2 transition-colors ${brushColor === color ? 'border-gray-800' : 'border-gray-300'}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          <button
            onClick={handleUndo}
            className="flex items-center justify-center p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            aria-label="Undo"
          >
            <ArrowUturnLeftIcon className="w-6 h-6" />
          </button>

          <button
            onClick={handleClear}
            className="flex items-center justify-center p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
            aria-label="Clear canvas"
          >
            <TrashIcon className="w-6 h-6" />
          </button>
        </div>

        <button
          ref={buttonRef}
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`
            w-full py-3 landscape:py-2 rounded-lg font-bold text-lg landscape:text-sm transition-colors
            ${!isSubmitting
              ? 'bg-rose-800 text-white hover:bg-rose-900 shadow-sm'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Drawing'}
        </button>
      </div>
    </div>
  )
}
