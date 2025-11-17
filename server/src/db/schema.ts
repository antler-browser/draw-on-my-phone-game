import { sql } from 'drizzle-orm'
import { text, index, sqliteTable, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Games table - One per game room
export const games = sqliteTable('games', {
  id: text('id').notNull().primaryKey(),
  hostDid: text('host_did'), // Nullable - set when first player joins
  status: text('status').notNull().default('lobby'), // 'lobby' | 'playing' | 'finished'
  timerDuration: integer('timer_duration').notNull().default(60), // seconds per turn
  currentRound: integer('current_round').notNull().default(0),
  roundStartTime: integer('round_start_time'), // Unix timestamp when current round started
  totalPlayers: integer('total_players'), // Set when game starts, immutable after
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
})

// Players table - Multiple players per game
export const players = sqliteTable('players', {
  id: integer('id').notNull().primaryKey({ autoIncrement: true }),
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  did: text('did').notNull(),
  name: text('name').notNull(),
  avatar: text('avatar'),
  turnPosition: integer('turn_position').notNull(), // 0-indexed position in turn rotation
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('idx_players_game_id').on(table.gameId),
  uniqueIndex('idx_players_game_did_unique').on(table.gameId, table.did),
])

// Submissions table - Completion tracking for word selections, drawings, and guesses
// Content (words, drawings, guesses) stored locally on each device
export const submissions = sqliteTable('submissions', {
  id: integer('id').notNull().primaryKey({ autoIncrement: true }),
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  chainOwnerDid: text('chain_owner_did').notNull(), // Whose "phone" this submission belongs to
  round: integer('round').notNull(), // 0-indexed (round 0 = word selection)
  submitterDid: text('submitter_did').notNull(), // Who made this submission
  type: text('type').notNull(), // 'word' | 'draw' | 'guess'
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (table) => [
  index('idx_submissions_game_id').on(table.gameId),
  index('idx_submissions_chain_owner').on(table.chainOwnerDid),
  index('idx_submissions_game_round').on(table.gameId, table.round),
])

// Type inference for TypeScript
export type Game = typeof games.$inferSelect
export type GameInsert = typeof games.$inferInsert
export type Player = typeof players.$inferSelect
export type PlayerInsert = typeof players.$inferInsert
export type Submission = typeof submissions.$inferSelect
export type SubmissionInsert = typeof submissions.$inferInsert
