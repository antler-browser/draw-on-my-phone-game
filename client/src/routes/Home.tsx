import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CreateGame } from '../components/CreateGame'

export function Home() {
  const [isLocalFirstAuth, setIsLocalFirstAuth] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Check if running in a Local First Auth app
    setIsLocalFirstAuth(!!window.localFirstAuth)
  }, [])

  const handleCreateGame = async (timerDuration: number) => {
    try {
      // No JWT required - game created on TV without player profiles
      const response = await fetch('/api/game/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timerDuration }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create game')
      }

      const data = await response.json()
      const createdGameId = data.gameId

      // Navigate to the game route (will show QR code for players to join)
      navigate(`/game/${createdGameId}`)
    } catch (err) {
      console.error('Error creating game:', err)
      throw err
    }
  }

  return (
    <CreateGame
      onCreateGame={handleCreateGame}
      isLocalFirstAuth={isLocalFirstAuth}
    />
  )
}
