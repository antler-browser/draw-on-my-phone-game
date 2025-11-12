import { drizzle } from 'drizzle-orm/d1'
import { migrate } from 'drizzle-orm/d1/migrator'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getPlatformProxy } from 'wrangler'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function runMigrations() {
  try {
    console.log('📂 Connecting to local D1 database...')

    // Use Wrangler's getPlatformProxy to access local D1 database
    const { env, dispose } = await getPlatformProxy()
    const db = drizzle(env.DB)

    console.log('🔄 Running migrations...')

    // Run all pending migrations from the migrations folder
    await migrate(db, {
      migrationsFolder: resolve(__dirname, '../server/src/db/migrations'),
    })

    console.log('✅ Migrations completed successfully!')

    await dispose()
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

runMigrations()
