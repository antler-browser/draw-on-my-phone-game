#!/usr/bin/env node
/**
 * Ensures client/dist/ exists before starting dev server
 * Builds client on first run to prevent Wrangler errors
 */

import { existsSync } from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')
const clientDistPath = join(rootDir, 'client', 'dist')

// Check if client/dist exists
if (!existsSync(clientDistPath)) {
  console.log('📦 client/dist not found - building client for first-time setup...')
  try {
    execSync('pnpm run build:client', { cwd: rootDir, stdio: 'inherit' })
    console.log('✅ Client built successfully\n')
  } catch (error) {
    console.error('❌ Failed to build client:', error.message)
    process.exit(1)
  }
} else {
  console.log('✅ client/dist exists - skipping initial build\n')
}
