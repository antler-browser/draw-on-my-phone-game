/**
 * Pure game logic functions shared between client and server
 * These functions have no side effects and can be used for validation and computation
 */

import type { TaskType } from './types'
import wordList from '../../word-list.json'

/**
 * Determine what type of task the current round requires
 *
 * Round 0 is always word selection
 * For odd number of players: round 1 = draw, round 2 = guess, etc.
 * For even number of players: round 1 = guess, round 2 = draw, etc.
 */
export function getTaskType(round: number, playerCount: number): TaskType {
  if (round === 0) {
    return 'word'
  }

  const isEvenPlayers = playerCount % 2 === 0

  // For odd players: rounds 1,3,5 are draw
  // For even players: rounds 2,4,6 are draw
  const isDrawRound = isEvenPlayers
    ? (round % 2 === 0)  // even players: rounds 2,4,6 are draw
    : (round % 2 === 1)  // odd players: rounds 1,3,5 are draw

  return isDrawRound ? 'draw' : 'guess'
}

/**
 * Determine which chain (phone) a player currently has
 * Chains rotate each round counter-clockwise
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
  // Chains rotate: I receive the chain from the player (currentRound) positions behind me
  return (myTurnPosition - currentRound + playerCount) % playerCount
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
 * Game completes when currentRound >= playerCount
 */
export function isGameComplete(currentRound: number, playerCount: number): boolean {
  return currentRound >= playerCount
}

/**
 * Get total number of rounds in the game
 * Total rounds = player count (round 0 through N-1)
 */
export function getTotalRounds(playerCount: number): number {
  return playerCount
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
