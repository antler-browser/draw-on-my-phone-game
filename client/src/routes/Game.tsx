import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { decodeAndVerifyJWT } from '@meetup/shared'
import { GameLobby } from '../components/GameLobby'
import { WordSelection } from '../components/WordSelection'
import { DrawingView } from '../components/DrawingView'
import { GuessView } from '../components/GuessView'
import { ChainReveal } from '../components/ChainReveal'
import { useGameStore, selectMyTask } from '../stores/gameStore'

export function Game() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const [isJoining, setIsJoining] = useState(true)
  const [joinError, setJoinError] = useState<string | null>(null)

  // Zustand store
  const gameState = useGameStore(state => state.gameState)
  const myDid = useGameStore(state => state.myDid)
  const setMyDid = useGameStore(state => state.setMyDid)
  const connectWebSocket = useGameStore(state => state.connectWebSocket)
  const disconnectWebSocket = useGameStore(state => state.disconnectWebSocket)
  const clearGame = useGameStore(state => state.clearGame)
  const myTask = useGameStore(selectMyTask)

  useEffect(() => {
    // Get profile DID and set in store
    loadProfileDid()

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

  const getProfileJwt = async (): Promise<string> => {
    if (!window.irlBrowser) {
      throw new Error('IRL Browser not available')
    }
    return await window.irlBrowser.getProfileDetails()
  }

  const getAvatarJwt = async (): Promise<string | null> => {
    if (!window.irlBrowser) {
      throw new Error('IRL Browser not available')
    }
    return await window.irlBrowser.getAvatar()
  }

  const autoJoinGame = async () => {
    if (!gameId) {
      setJoinError('No game ID provided')
      setIsJoining(false)
      return
    }else if (!window.irlBrowser) {
      console.error('IRL Browser not found')
      setIsJoining(false)

      // Connect to WebSocket if no IRL Browser
      const baseUrl = window.location.protocol + '//' + window.location.host
      connectWebSocket(gameId, baseUrl)
      return
    }

    try {
      const profileJwt = await getProfileJwt()
      const avatarJwt = await getAvatarJwt()

      const response = await fetch(`/api/game/${gameId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileJwt, avatarJwt }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to join game')
      }

      // Successfully joined (either new or existing player)
      setIsJoining(false)

      // Connect to WebSocket
      const baseUrl = window.location.protocol + '//' + window.location.host
      connectWebSocket(gameId, baseUrl)
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

    try {
      const profileJwt = await getProfileJwt()

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
  
  // if not IRL Browser, show error message
  if (!window.irlBrowser) {
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
          gameId={gameId!}
          onStartGame={handleStartGame}
        />
      )
    }else if (gameState.status === 'playing') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-gray-800 text-center">
            <p className="text-xl font-semibold">Game is in progress!</p>
          </div>
        </div>
      )
    }else if (gameState.status === 'finished') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-gray-800 text-center">
            <p className="text-xl font-semibold">Game is finished!</p>
          </div>
        </div>
      )
    }
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
              clearGame()
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

  // Still joining or waiting for game state from WebSocket
  if (isJoining || !gameState) {
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
          if (gameState) {
            clearGame(gameState.gameId)
          }
          navigate('/')
        }}
      />
    )
  }

  // Fallback
  return null
}
