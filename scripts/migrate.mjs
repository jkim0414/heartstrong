// One-shot database setup: applies supabase/schema.sql to your Supabase
// Postgres. Run with:  npm run migrate
// (reads DATABASE_URL from .env.local via Node's --env-file)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { readEnv } from './env.mjs'

const url = readEnv().DATABASE_URL || process.env.DATABASE_URL
if (!url) {
  console.error(
    '\n✗ DATABASE_URL is not set.\n' +
      '  Supabase → Project Settings → Database → Connection string → URI.\n' +
      '  Paste it into .env.local as DATABASE_URL=postgresql://...\n',
  )
  process.exit(1)
}

const schemaPath = fileURLToPath(new URL('../supabase/schema.sql', import.meta.url))
const sql = readFileSync(schemaPath, 'utf8')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
try {
  await client.connect()
  await client.query(sql)
  console.log('\n✓ Database ready: app_state table + row-level security policies applied.\n')
} catch (e) {
  console.error('\n✗ Migration failed:', e.message, '\n')
  process.exit(1)
} finally {
  await client.end()
}
