/**
 * Pure game logic functions shared between client and server
 * These functions have no side effects and can be used for validation and computation
 *
 * === EVEN VS ODD PLAYER COUNTS ===
 *
 * The game must always END on a guess (not a draw). This creates different flows:
 *
 * ODD PLAYERS (3, 5, 7...):
 *   Round 0: Pick word → pass phone
 *   Round 1: Draw (someone else's word) → pass phone
 *   Round 2: Guess → end (for 3 players)
 *   Total rounds = playerCount
 *
 * EVEN PLAYERS (4, 6, 8...):
 *   Round 0: Pick word (NO pass - stay on your own phone)
 *   Round 1: Draw YOUR OWN word (no rotation yet) → pass phone
 *   Round 2: Guess (first rotation happens) → pass phone
 *   Round 3: Draw → pass phone
 *   Round 4: Guess → end (for 4 players)
 *   Total rounds = playerCount + 1
 *
 * The "effectiveRound" concept handles this: for even players, we subtract 1
 * from all rounds >= 1, making Round 1 behave like Round 0 (no rotation).
 */

import type { TaskType } from './types'
import wordList from '../../word-list.json'

/**
 * Calculate the effective round for chain rotation purposes.
 * This is the single source of truth for the even-player adjustment.
 *
 * For even player counts, Round 1 doesn't rotate (same person holds chain as Round 0).
 * We achieve this by making effectiveRound = 0 for Round 1, = 1 for Round 2, etc.
 *
 * @param currentRound - Current round number (0-indexed)
 * @param playerCount - Total number of players
 * @returns The effective round number for rotation calculations
 */
export function getEffectiveRound(currentRound: number, playerCount: number): number {
  const isEvenPlayers = playerCount % 2 === 0
  return (isEvenPlayers && currentRound >= 1) ? currentRound - 1 : currentRound
}

/**
 * Determine what type of task the current round requires
 *
 * Round 0: Always word selection (all players)
 *
 * After round 0:
 *   - Odd rounds (1,3,5): draw
 *   - Even rounds (2,4,6): guess
 */
export function getTaskType(round: number): TaskType {
  if (round === 0) {
    return 'word'
  }
  return round % 2 === 1 ? 'draw' : 'guess'
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
  const effectiveRound = getEffectiveRound(currentRound, playerCount)

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
  const effectiveRound = getEffectiveRound(currentRound, playerCount)

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
