import { useState, useEffect, useRef } from 'react'
import { useGameStore, selectDeadline } from '../stores/gameStore'

interface GameTimerProps {
  onExpire?: () => void
}

/**
 * GameTimer component
 * Shows countdown timer for current round
 * Calls onExpire callback once when timer reaches 0
 */
export function GameTimer({ onExpire }: GameTimerProps) {
  const deadline = useGameStore(selectDeadline)
  const [timeLeft, setTimeLeft] = useState(0)
  const hasExpired = useRef(false)

  useEffect(() => {
    // Reset expired flag when deadline changes (new round)
    hasExpired.current = false
  }, [deadline])

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now())
      setTimeLeft(remaining)

      if (remaining === 0) {
        clearInterval(interval)

        // Call onExpire callback once
        if (onExpire && !hasExpired.current) {
          hasExpired.current = true
          onExpire()
        }
      }
    }, 100) // Update every 100ms for smooth countdown

    return () => clearInterval(interval)
  }, [deadline, onExpire])

  const totalSeconds = Math.floor(timeLeft / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  const isWarning = totalSeconds < 10 && totalSeconds > 0

  return (
    <div className={`
      text-4xl landscape:text-2xl font-bold font-mono p-4 landscape:p-2 rounded-lg
      ${isWarning ? 'text-red-500 animate-pulse' : 'text-gray-700'}
    `}>
      {minutes}:{seconds.toString().padStart(2, '0')}
    </div>
  )
}
