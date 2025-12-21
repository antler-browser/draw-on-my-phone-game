import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { decodeAndVerifyJWT } from '@internal/shared'
import { IrlOnboarding } from 'irl-browser-onboarding/react'
import { GameLobby } from '../components/GameLobby'
import { WordSelection } from '../components/WordSelection'
import { DrawingView } from '../components/DrawingView'
import { GuessView } from '../components/GuessView'
import { ChainReveal } from '../components/ChainReveal'
import { DesktopView } from '../components/DesktopView'
import { useGameStore, selectMyTask } from '../stores/gameStore'

export function Game() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const [isJoining, setIsJoining] = useState(true)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null) // null = loading
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)

  // Zustand store
  const gameState = useGameStore(state => state.gameState)
  const myDid = useGameStore(state => state.myDid)
  const setMyDid = useGameStore(state => state.setMyDid)
  const joinAndConnect = useGameStore(state => state.joinAndConnect)
  const disconnectWebSocket = useGameStore(state => state.disconnectWebSocket)
  const clearAllGamesExceptGameId = useGameStore(state => state.clearAllGamesExceptGameId)
  const myTask = useGameStore(selectMyTask)

  // Handler for when onboarding completes - now window.irlBrowser is available
  const handleOnboardingComplete = useCallback(async () => {
    setShowOnboardingModal(false)
    setShowOnboarding(false)
    // Re-run the join flow now that irlBrowser is available
    await loadProfileDid()
    await autoJoinGame()
  }, [])

  useEffect(() => {
    // Check if window.irlBrowser is available (native app or returning web user)
    const hasIrlBrowser = !!window.irlBrowser
    setShowOnboarding(!hasIrlBrowser)

    // Get profile DID and set in store (only if irlBrowser available)
    if (hasIrlBrowser) {
      loadProfileDid()
    }

    // Auto-join the game
    autoJoinGame()

    // Cleanup on unmount
    return () => {
      disconnectWebSocket()
    }
  }, [])

  const loadProfileDid = async () => {
    try {
      if (!window.irlBrowser) {
        console.log('IRL Browser not found')
        return
      }

      const profileJwt = await window.irlBrowser.getProfileDetails()
      const profilePayload = await decodeAndVerifyJWT(profileJwt)

      // Set DID in store
      setMyDid(profilePayload.iss)
    } catch (err) {
      console.error('Error loading profile DID:', err)
    }
  }

  const autoJoinGame = async () => {
    if (!gameId) {
      setJoinError('No game ID provided')
      setIsJoining(false)
      return
    }

    // Clear all other game data before joining
    clearAllGamesExceptGameId(gameId)

    try {
      const baseUrl = `${window.location.protocol}//${window.location.host}`

      // joinAndConnect handles: IRL Browser check, REST join, then WebSocket connect
      const result = await joinAndConnect(gameId, baseUrl)

      if (!result.success) {
        throw new Error(result.error || 'Failed to join game')
      }

      setIsJoining(false)
    } catch (err) {
      console.error('Error joining game:', err)
      setJoinError((err as Error).message)
      setIsJoining(false)
    }
  }

  const handleStartGame = async () => {
    if (!gameId) {
      throw new Error('No game ID')
    }

    if (!window.irlBrowser) {
      throw new Error('IRL Browser not available')
    }

    try {
      const profileJwt = await window.irlBrowser.getProfileDetails()

      const response = await fetch(`/api/game/${gameId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileJwt }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to start game')
      }

      // Game state will be updated via WebSocket
    } catch (err) {
      console.error('Error starting game:', err)
      throw err
    }
  }
  
  // If no IRL Browser and onboarding is needed, show DesktopView with onboarding option
  if (showOnboarding) {
    return (
      <>
        <DesktopView
          gameState={gameState}
          gameId={gameId!}
          onStartGame={handleStartGame}
        />

        {/* Floating "Join Game" button for users without IRL Browser */}
        <button
          onClick={() => setShowOnboardingModal(true)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-rose-800 text-white px-8 py-4 rounded-full shadow-lg hover:bg-rose-900 transition-all hover:scale-105 font-semibold text-lg z-40"
        >
          Join Game
        </button>

        {/* Onboarding modal */}
        {showOnboardingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowOnboardingModal(false)}
            />
            {/* Modal content */}
            <div className="relative z-10 w-full max-w-lg mx-4 max-h-[90vh] overflow-auto rounded-2xl shadow-2xl">
              <IrlOnboarding
                mode="choice"
                skipSocialStep={true}
                onComplete={handleOnboardingComplete}
                customStyles={{ primaryColor: '#9f1239' }}
              />
            </div>
          </div>
        )}
      </>
    )
  }

  // Show error if join failed
  if (joinError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Unable to Join Game</h1>
          <p className="text-gray-600 mb-6">{joinError}</p>
          <button
            onClick={() => {
              navigate('/')
            }}
            className="bg-rose-800 text-white py-3 px-6 rounded-lg font-bold hover:bg-rose-900 transition-colors shadow-sm"
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  // Still joining or waiting for game state from WebSocket or myDid
  if (isJoining || !gameState || !myDid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-800 text-center">
          <div className="inline-block p-4 bg-rose-100 rounded-full mb-4">
            <svg
              className="w-12 h-12 animate-spin text-rose-800"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          <p className="text-xl font-semibold">
            {isJoining ? 'Joining game...' : 'Loading game...'}
          </p>
        </div>
      </div>
    )
  }

  // Game is in lobby → Show GameLobby
  if (gameState.status === 'lobby') {
    return (
      <GameLobby
        gameId={gameId!}
        onStartGame={handleStartGame}
      />
    )
  }

  // Game is playing → Show gameplay components based on current task
  if (gameState.status === 'playing') {
    if (myTask === 'word') {
      return <WordSelection />
    }

    if (myTask === 'draw') {
      return <DrawingView />
    }

    if (myTask === 'guess') {
      return <GuessView />
    }

    // Waiting state (shouldn't normally happen)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow-md p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Please wait...</h2>
          <p className="text-gray-600">Loading game...</p>
        </div>
      </div>
    )
  }

  // Game is finished → Show chain reveal (Phase 3)
  if (gameState.status === 'finished') {
    return (
      <ChainReveal
        chainOwnerDid={myDid}
        onBackToHome={() => {
          navigate('/')
        }}
      />
    )
  }

  // Fallback
  return null
}
