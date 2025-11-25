import { useRef, useEffect, useState } from 'react'
import CanvasDraw from 'react-canvas-draw'
import { useGameStore, selectPlayers } from '../stores/gameStore'
import { Avatar } from './Avatar'
import type { ChainData, DrawingData } from '../stores/gameStore'

interface ChainRevealProps {
  chainOwnerDid: string
  onBackToHome: () => void
}

/**
 * ChainReveal component
 * Displays the complete evolution of a single chain
 * Shows words, guesses, and drawings (with physical phone passing for others' drawings)
 */
export function ChainReveal({ chainOwnerDid, onBackToHome }: ChainRevealProps) {
  const players = useGameStore(selectPlayers)
  const chainSubmissions = useGameStore(state => state.chainSubmissions)
  const getDrawing = useGameStore(state => state.getDrawing)
  const myDid = useGameStore(state => state.myDid)
  const gameState = useGameStore(state => state.gameState)

  const chainOwner = players.find(p => p.did === chainOwnerDid)
  const isMyChain = chainOwnerDid === myDid

  // If it's not my chain, show pass phone prompt
  if (!isMyChain) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6 landscape:p-3">
        <div className="bg-white rounded-xl shadow-md p-8 landscape:p-4 max-w-md w-full text-center">
          <h2 className="text-2xl landscape:text-lg font-bold text-gray-800 mb-4 landscape:mb-2">Physical Phone Passing</h2>
          <p className="text-gray-600 landscape:text-xs mb-6 landscape:mb-3">
            To view {chainOwner?.name || 'this'}'s chain, you need their phone!
          </p>
          <p className="text-sm landscape:text-xs text-gray-500 mb-6 landscape:mb-3">
            Each phone stores its own chain locally. Pass phones around to view different chains.
          </p>
          <button
            onClick={onBackToHome}
            className="w-full py-3 landscape:py-2 bg-rose-800 text-white rounded-lg font-bold landscape:text-sm hover:bg-rose-900 shadow-sm transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  // Build chain from localStorage (filter by current gameId and myDid)
  const chain: ChainData[] = gameState && myDid
    ? Object.entries(chainSubmissions)
        .filter(([key]) => key.startsWith(`${gameState.gameId}:${myDid}:`))
        .map(([_, data]) => data)
        .sort((a, b) => a.round - b.round)
    : []

  if (!chain.length || !chainOwner) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6 landscape:p-3">
        <div className="bg-white rounded-xl shadow-md p-8 landscape:p-4 max-w-md w-full text-center">
          <h2 className="text-2xl landscape:text-lg font-bold text-gray-800 mb-2">Chain Not Found</h2>
          <p className="text-gray-600 landscape:text-xs mb-4 landscape:mb-2">No submissions found for this chain.</p>
          <button
            onClick={onBackToHome}
            className="mt-6 landscape:mt-3 w-full py-3 landscape:py-2 bg-maroon-700 text-white rounded-lg font-bold landscape:text-sm hover:bg-maroon-800 shadow-sm transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  // Extract the first word submission for the header
  const firstWordSubmission = chain.find(s => s.type === 'word')
  // Filter out the first word from the remaining submissions
  const remainingSubmissions = chain.filter(s => !(s.type === 'word' && s.round === firstWordSubmission?.round))

  return (
    <div className="min-h-screen bg-gray-50 p-6 landscape:p-2">
      <div className="mx-auto">
        {/* Header with initial word */}
        <div className="bg-white rounded-xl shadow-md p-6 landscape:p-3 mb-6 landscape:mb-3">
          <div className="flex items-center gap-4 landscape:gap-2 mb-4 landscape:mb-2">
            <Avatar avatar={chainOwner.avatar} name={chainOwner.name} size="md" />
            <p className="text-xl landscape:text-base text-gray-600">
              {chainOwner.name}'s word was...
            </p>
          </div>
          {firstWordSubmission && (
            <p className="text-3xl landscape:text-xl font-bold text-gray-800 text-center mb-4 landscape:mb-2">
              {firstWordSubmission.content}
            </p>
          )}
        </div>

        {/* Chain submissions (excluding first word) */}
        <div className="space-y-6 landscape:space-y-3 mb-6 landscape:mb-3">
          {remainingSubmissions.map((submission, index) => {
            const submitter = players.find(p => p.did === submission.submitterDid)
            const isMySubmission = submission.submitterDid === myDid

            return (
              <SubmissionCard
                key={`${submission.round}-${submission.type}`}
                submission={submission}
                submitter={submitter}
                isMySubmission={isMySubmission}
                index={index}
                myDid={myDid}
                getDrawing={getDrawing}
                gameId={gameState?.gameId || ''}
              />
            )
          })}
        </div>

        {/* Actions */}
        <div className="bg-white rounded-xl shadow-md p-6 landscape:p-3">
          <button
            onClick={onBackToHome}
            className="w-full py-4 landscape:py-2 bg-rose-600 text-white rounded-lg font-bold landscape:text-sm hover:bg-rose-700 transition-colors text-lg shadow-sm"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Individual submission card
 */
function SubmissionCard({
  submission,
  submitter,
  isMySubmission,
  index,
  myDid,
  getDrawing,
  gameId
}: {
  submission: ChainData
  submitter: any
  isMySubmission: boolean
  index: number
  myDid: string
  getDrawing: (gameId: string, round: number) => DrawingData | undefined
  gameId: string
}) {
  const canvasRef = useRef<any>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 700, height: 400 })

  // Calculate optimal canvas size for reveal
  useEffect(() => {
    const updateCanvasSize = () => {
      if (!cardRef.current) return

      // Use actual card width (accounts for all padding automatically)
      const availableWidth = cardRef.current.clientWidth

      // Use a reasonable height based on viewport (60% of viewport height)
      const viewportHeight = window.innerHeight
      const height = Math.max(300, viewportHeight * 0.6)

      setCanvasSize({ width: availableWidth, height })
    }

    updateCanvasSize()
    window.addEventListener('resize', updateCanvasSize)
    window.addEventListener('orientationchange', updateCanvasSize)

    return () => {
      window.removeEventListener('resize', updateCanvasSize)
      window.removeEventListener('orientationchange', updateCanvasSize)
    }
  }, [])

  // Load drawing from localStorage if this is a drawing submission
  // All drawings in this chain are on this device
  useEffect(() => {
    if (submission.type === 'draw') {
      const drawingData = getDrawing(gameId, submission.round)
      if (drawingData) {
        // Restore the exact canvas dimensions from when the drawing was created
        if (drawingData.width && drawingData.height) {
          setCanvasSize({ width: drawingData.width, height: drawingData.height })
        }

        // Load the drawing data after dimensions are set
        if (canvasRef.current && drawingData.drawing) {
          // Use setTimeout to ensure canvas is resized before loading data
          setTimeout(() => {
            if (canvasRef.current) {
              try {
                canvasRef.current.loadSaveData(drawingData.drawing)
              } catch (err) {
                console.error('Failed to load drawing:', err)
              }
            }
          }, 50)
        }
      }
    }
  }, [submission, getDrawing, gameId])

  // Word submission
  if (submission.type === 'word') {
    return (
      <div className="bg-white rounded-xl shadow-md p-6 landscape:p-3 border-2 border-gray-300">
        <div className="flex items-center gap-3 landscape:gap-2 mb-4 landscape:mb-2">
          <div className="bg-rose-100 text-rose-800 px-3 py-1 landscape:px-2 landscape:py-0.5 rounded-full text-sm landscape:text-xs font-bold">
            Round {submission.round }: Word
          </div>
          <div className="flex items-center gap-2 landscape:gap-1">
            <Avatar avatar={submitter?.avatar} name={submitter?.name || 'Unknown'} size="sm" />
            <span className="text-sm landscape:text-xs text-gray-600">
              {submitter?.name || 'Unknown'}
              {isMySubmission && <span className="text-rose-800 ml-1 font-semibold">(You)</span>}
            </span>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-8 landscape:p-4 text-center border border-gray-200">
          <p className="text-3xl landscape:text-xl font-bold text-gray-800">{submission.content}</p>
        </div>
      </div>
    )
  }

  // Guess submission
  if (submission.type === 'guess') {
    return (
      <div className="bg-white rounded-xl shadow-md p-6 landscape:p-3 border-2 border-gray-300">
        <div className="flex items-center gap-3 landscape:gap-2 mb-4 landscape:mb-2">
          <div className="bg-rose-100 text-rose-800 px-3 py-1 landscape:px-2 landscape:py-0.5 rounded-full text-sm landscape:text-xs font-bold">
            Round {submission.round }: Guess
          </div>
          <div className="flex items-center gap-2 landscape:gap-1">
            <Avatar avatar={submitter?.avatar} name={submitter?.name || 'Unknown'} size="sm" />
            <span className="text-sm landscape:text-xs text-gray-600">
              {submitter?.name || 'Unknown'}
              {isMySubmission && <span className="text-rose-800 ml-1 font-semibold">(You)</span>}
            </span>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-8 landscape:p-4 text-center border border-gray-200">
          <p className="text-2xl landscape:text-lg font-bold text-gray-800">{submission.content}</p>
        </div>
      </div>
    )
  }

  // Drawing submission
  // All drawings in this chain are stored on this device (since this is the chain owner's phone)
  if (submission.type === 'draw') {
    return (
      <div ref={cardRef} className="bg-white rounded-xl shadow-md p-6 landscape:p-3 border-2 border-gray-300">
        <div className="flex items-center gap-3 landscape:gap-2 mb-4 landscape:mb-2">
          <div className="bg-rose-100 text-rose-800 px-3 py-1 landscape:px-2 landscape:py-0.5 rounded-full text-sm landscape:text-xs font-bold">
            Round {submission.round }: Drawing
          </div>
          <div className="flex items-center gap-2 landscape:gap-1">
            <Avatar avatar={submitter?.avatar} name={submitter?.name || 'Unknown'} size="sm" />
            <span className="text-sm landscape:text-xs text-gray-600">
              {submitter?.name || 'Unknown'}
              {isMySubmission && <span className="text-rose-800 ml-1 font-semibold">(You)</span>}
            </span>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 landscape:p-2 border border-gray-200">
          <div
            className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white relative"
            style={{ width: canvasSize.width, height: canvasSize.height }}
          >
            <CanvasDraw
              ref={canvasRef}
              disabled
              hideGrid
              canvasWidth={canvasSize.width}
              canvasHeight={canvasSize.height}
              brushRadius={0}
              lazyRadius={0}
            />
          </div>
        </div>
      </div>
    )
  }

  return null
}
