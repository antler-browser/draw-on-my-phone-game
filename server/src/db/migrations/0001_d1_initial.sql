-- D1 Migration: Initial schema for meetup users
-- This creates the users table compatible with Cloudflare D1

CREATE TABLE IF NOT EXISTS users (
  did TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  avatar TEXT,
  socials TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Create index on created_at for efficient querying
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
