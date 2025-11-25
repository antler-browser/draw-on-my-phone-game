/**
 * Pure game logic functions shared between client and server
 * These functions have no side effects and can be used for validation and computation
 */

import type { TaskType } from './types'
import wordList from '../../word-list.json'

/**
 * Determine what type of task the current round requires
 *
 * Round 0: Always word selection (all players)
 *
 * After round 0:
 *   - For odd players: rounds 1,3,5 are draw; rounds 2,4,6 are guess
 *   - For even players: rounds 1,3,5 are draw; rounds 2,4,6 are guess
 */
export function getTaskType(round: number, playerCount: number): TaskType {
  const isEvenPlayers = playerCount % 2 === 0

  if (round === 0) {
    // All players: word selection only
    return 'word'
  }

  // For both odd and even players: odd rounds are draw, even rounds are guess
  const isDrawRound = round % 2 === 1

  return isDrawRound ? 'draw' : 'guess'
}

/**
 * Determine which chain (phone) a player currently has
 * Chains rotate each round counter-clockwise
 * Special case: For even players, Round 1 doesn't rotate (same player as Round 0)
 *
 * @param myTurnPosition - Current player's turn position (0-indexed)
 * @param currentRound - Current round number (0-indexed)
 * @param playerCount - Total number of players
 * @returns The turn position of the chain owner
 */
export function getChainOwnerPosition(
  myTurnPosition: number,
  currentRound: number,
  playerCount: number
): number {
  const isEvenPlayers = playerCount % 2 === 0

  // For even players in Round 1: same player as Round 0 (no rotation)
  // Adjust effective round count to account for non-rotation
  const effectiveRound = (isEvenPlayers && currentRound >= 1)
    ? currentRound - 1
    : currentRound

  // Chains rotate: I receive the chain from the player (effectiveRound) positions behind me
  return (myTurnPosition - effectiveRound + playerCount) % playerCount
}

/**
 * Determine who is currently holding a specific chain
 * This is the inverse of getChainOwnerPosition()
 * Special case: For even players, Round 1 doesn't rotate (same player as Round 0)
 *
 * @param chainOwnerPosition - The chain owner's turn position (0-indexed)
 * @param currentRound - Current round number (0-indexed)
 * @param playerCount - Total number of players
 * @returns The turn position of who is currently holding this chain
 */
export function getCurrentHolderPosition(
  chainOwnerPosition: number,
  currentRound: number,
  playerCount: number
): number {
  const isEvenPlayers = playerCount % 2 === 0

  // For even players in Round 1: same player as Round 0 (no rotation)
  // Adjust effective round count to account for non-rotation
  const effectiveRound = (isEvenPlayers && currentRound >= 1)
    ? currentRound - 1
    : currentRound

  // Chains rotate forward: chain owner position + effective round
  return (chainOwnerPosition + effectiveRound) % playerCount
}

/**
 * Determine which player should receive this chain next
 *
 * @param currentHolderPosition - Current holder's turn position
 * @param playerCount - Total number of players
 * @returns The turn position of the next holder
 */
export function getNextChainHolder(
  currentHolderPosition: number,
  playerCount: number
): number {
  return (currentHolderPosition + 1) % playerCount
}

/**
 * Check if the game is complete
 * Game completes when currentRound >= total rounds
 */
export function isGameComplete(currentRound: number, playerCount: number): boolean {
  return currentRound >= getTotalRounds(playerCount)
}

/**
 * Get total number of rounds in the game
 * - Odd players: playerCount rounds (e.g., 3 players = 3 rounds)
 * - Even players: playerCount + 1 rounds (e.g., 4 players = 5 rounds)
 */
export function getTotalRounds(playerCount: number): number {
  const isEvenPlayers = playerCount % 2 === 0
  return isEvenPlayers ? playerCount + 1 : playerCount
}

/**
 * Get random words from the word list
 * Selects one word from each category until we have the requested count
 *
 * @param count - Number of words to return (typically 4)
 * @returns Array of random words
 */
export function getRandomWords(count: number): string[] {
  const categories = Object.keys(wordList) as Array<keyof typeof wordList>
  const selectedWords: string[] = []
  const usedCategories = new Set<string>()

  // Shuffle categories to randomize which ones we pick from
  const shuffledCategories = [...categories].sort(() => Math.random() - 0.5)

  for (let i = 0; i < count && i < shuffledCategories.length; i++) {
    const category = shuffledCategories[i]
    const wordsInCategory = wordList[category]

    if (wordsInCategory && wordsInCategory.length > 0) {
      // Pick a random word from this category
      const randomIndex = Math.floor(Math.random() * wordsInCategory.length)
      selectedWords.push(wordsInCategory[randomIndex])
      usedCategories.add(category)
    }
  }

  return selectedWords
}
