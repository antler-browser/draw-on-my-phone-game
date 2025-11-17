import { eq, and } from 'drizzle-orm'
import type { Database } from '../client'
import { submissions, type Submission, type SubmissionInsert } from '../schema'

/**
 * Create a new submission (word, drawing, or guess)
 */
export async function createSubmission(
  db: Database,
  data: SubmissionInsert
): Promise<Submission> {
  const result = await db
    .insert(submissions)
    .values(data)
    .returning()

  return result[0]
}

/**
 * Count submissions for a specific game and round
 */
export async function countSubmissionsByGameAndRound(
  db: Database,
  gameId: string,
  round: number
): Promise<number> {

  const result = await db
    .select()
    .from(submissions)
    .where(and(
      eq(submissions.gameId, gameId),
      eq(submissions.round, round)
    ))

  return result.length
}

/**
 * Get submission by a specific submitter in a specific round
 */
export async function getSubmissionBySubmitter(
  db: Database,
  gameId: string,
  round: number,
  submitterDid: string
): Promise<Submission | null> {
  const result = await db
    .select()
    .from(submissions)
    .where(and(
      eq(submissions.gameId, gameId),
      eq(submissions.round, round),
      eq(submissions.submitterDid, submitterDid)
    ))
    .limit(1)

  return result[0] || null
}

/**
 * Get all submissions for a specific game and round
 * Used by alarm handler to identify which players have submitted
 */
export async function getSubmissionsByGameAndRound(
  db: Database,
  gameId: string,
  round: number
): Promise<Submission[]> {
  const result = await db
    .select()
    .from(submissions)
    .where(and(
      eq(submissions.gameId, gameId),
      eq(submissions.round, round)
    ))

  return result
}

