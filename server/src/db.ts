import pg from 'pg'
import { getDatabaseConfig } from './config.js'

const { Pool } = pg

export function createPool() {
  const config = getDatabaseConfig()
  return new Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
}

export type DatabasePool = ReturnType<typeof createPool>
