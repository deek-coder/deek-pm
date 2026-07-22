import 'dotenv/config'
import { z } from 'zod'

const booleanFromString = z.string().optional().transform((value) => value === 'true')
const optionalSecret = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().min(32).max(500).optional(),
)

const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: booleanFromString,
})

const envSchema = databaseEnvSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3100),
  DEPLOYMENT_MODE: z.enum(['cloud', 'selfhost']).default('selfhost'),
  INSTANCE_NAME: z.string().min(1).default('Deek PM Self-hosted'),
  JWT_SECRET: z.string().min(32),
  DATA_ENCRYPTION_KEY: z.string().min(32),
  CORS_ORIGIN: z.string().default('*'),
  ALLOW_REGISTRATION: booleanFromString,
  SETUP_TOKEN: optionalSecret,
  STORAGE_MAX_FILE_SIZE: z.coerce.number().int().positive().default(100 * 1024 * 1024),
})

export type AppConfig = z.infer<typeof envSchema>
export type DatabaseConfig = z.infer<typeof databaseEnvSchema>

let cachedConfig: AppConfig | undefined
let cachedDatabaseConfig: DatabaseConfig | undefined

export function getConfig(): AppConfig {
  cachedConfig ??= envSchema.parse(process.env)
  return cachedConfig
}

export function getDatabaseConfig(): DatabaseConfig {
  cachedDatabaseConfig ??= databaseEnvSchema.parse(process.env)
  return cachedDatabaseConfig
}
