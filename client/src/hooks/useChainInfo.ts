import { useMemo } from 'react'
import { useGameStore } from '../stores/gameStore'
import { getCurrentHolderPosition, getNextChainHolder } from '@internal/shared'
import type { Player } from '@internal/shared'

/**
 * Information about the current chain state for this device
 *
 * In this pass-the-phone game:
 * - deviceOwner = the player whose phone this is (chain is stored on their device)
 * - currentHolder = the player currently using this phone (may be different during gameplay)
 * - nextHolder = the player who should receive this phone next
 */
export interface ChainInfo {
  /** The player whose phone this is (device owner = chain owner) */
  deviceOwner: Player | null
  /** The player currently holding/using this phone */
  currentHolder: Player | null
  /** The player who should receive this phone next */
  nextHolder: Player | null
  /** DID of the current holder (used for submission tracking) */
  currentHolderDid: string
}

/**
 * Hook to calculate chain ownership and current holder information.
 *
 * This is the single source of truth for determining:
 * - Who owns this device/chain
 * - Who is currently using this device
 * - Who should receive the phone next
 *
 * Uses the shared game-logic functions which handle the even-player
 * special case (Round 1 doesn't rotate for even player counts).
 */
export function useChainInfo(): ChainInfo {
  const myDid = useGameStore(state => state.myDid)
  const gameState = useGameStore(state => state.gameState)

  return useMemo(() => {
    const players = gameState?.players ?? []
    const currentRound = gameState?.currentRound ?? 0

    // Find the device owner (the player whose phone this is)
    const deviceOwner = players.find(p => p.did === myDid) ?? null

    if (!deviceOwner || players.length === 0) {
      return {
        deviceOwner: null,
        currentHolder: null,
        nextHolder: null,
        currentHolderDid: myDid,
      }
    }

    // Calculate who is currently holding this chain using shared game logic
    // This handles the even-player special case automatically via getEffectiveRound
    const currentHolderPosition = getCurrentHolderPosition(
      deviceOwner.turnPosition,
      currentRound,
      players.length
    )
    const currentHolder = players.find(p => p.turnPosition === currentHolderPosition) ?? null

    // Calculate who should receive the phone next
    const nextHolderPosition = getNextChainHolder(currentHolderPosition, players.length)
    const nextHolder = players.find(p => p.turnPosition === nextHolderPosition) ?? null

    return {
      deviceOwner,
      currentHolder,
      nextHolder,
      currentHolderDid: currentHolder?.did ?? myDid,
    }
  }, [myDid, gameState?.players, gameState?.currentRound])
}
