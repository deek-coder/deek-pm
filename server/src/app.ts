import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import Fastify from 'fastify'
import { ZodError } from 'zod'
import { getConfig } from './config.js'
import { createPool } from './db.js'
import { registerRoutes } from './routes.js'
import multipart from '@fastify/multipart'
import { StorageManager } from './storage.js'

export async function buildApp() {
  const config = getConfig()
  const pool = createPool()
  const app = Fastify({ logger: config.NODE_ENV !== 'test', bodyLimit: 8 * 1024 * 1024 })
  const storageManager = new StorageManager(pool, config.DATA_ENCRYPTION_KEY)

  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: false,
  })
  await app.register(jwt, { secret: config.JWT_SECRET })
  await app.register(multipart, {
    limits: { files: 1, fileSize: config.STORAGE_MAX_FILE_SIZE, fields: 5 },
  })

  app.decorate('httpErrors', {
    unauthorized: (message = 'Unauthorized') => Object.assign(new Error(message), { statusCode: 401 }),
    forbidden: (message = 'Forbidden') => Object.assign(new Error(message), { statusCode: 403 }),
    notFound: (message = 'Not found') => Object.assign(new Error(message), { statusCode: 404 }),
    conflict: (message = 'Conflict') => Object.assign(new Error(message), { statusCode: 409 }),
  })

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Validation failed', details: error.issues })
    }
    const resolvedError = error instanceof Error ? error : new Error('Unknown error')
    const statusCode = 'statusCode' in resolvedError && typeof resolvedError.statusCode === 'number' ? resolvedError.statusCode : 500
    if (statusCode >= 500) app.log.error(resolvedError)
    return reply.code(statusCode).send({ error: statusCode >= 500 ? 'Internal server error' : resolvedError.message })
  })

  app.addHook('onClose', async () => pool.end())
  await registerRoutes(app, pool, config, storageManager)
  return app
}

declare module 'fastify' {
  interface FastifyInstance {
    httpErrors: {
      unauthorized(message?: string): Error & { statusCode: number }
      forbidden(message?: string): Error & { statusCode: number }
      notFound(message?: string): Error & { statusCode: number }
      conflict(message?: string): Error & { statusCode: number }
    }
  }
}
