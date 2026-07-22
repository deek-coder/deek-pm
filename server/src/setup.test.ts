import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from '@fastify/jwt'
import Fastify from 'fastify'
import type { AppConfig } from './config.js'
import type { DatabasePool } from './db.js'
import { registerRoutes } from './routes.js'
import { StorageManager } from './storage.js'

const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations')

test('self-hosted setup creates the only initial administrator, workspace, and storage atomically', async () => {
  const db = new PGlite()
  const assetRoot = await mkdtemp(path.join(os.tmpdir(), 'deek-setup-assets-'))
  const setupToken = 'setup-token-for-tests-that-is-long-enough'
  try {
    for (const file of (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(await readFile(path.join(migrationsDirectory, file), 'utf8'))
    }
    const pool = {
      query: (text: string, values?: unknown[]) => db.query(text, values),
      connect: async () => ({
        query: (text: string, values?: unknown[]) => db.query(text, values),
        release: () => undefined,
      }),
    } as unknown as DatabasePool
    const config = {
      NODE_ENV: 'test', HOST: '127.0.0.1', PORT: 3100, DEPLOYMENT_MODE: 'selfhost', INSTANCE_NAME: 'Setup Test',
      DATABASE_URL: 'pglite://memory', DATABASE_SSL: false, JWT_SECRET: 'jwt-secret-for-tests-that-is-long-enough',
      DATA_ENCRYPTION_KEY: 'data-key-for-tests-that-is-long-enough', CORS_ORIGIN: '*', ALLOW_REGISTRATION: false,
      SETUP_TOKEN: setupToken, STORAGE_MAX_FILE_SIZE: 1024 * 1024,
    } satisfies AppConfig
    const app = Fastify({ logger: false })
    await app.register(jwt, { secret: config.JWT_SECRET })
    app.decorate('httpErrors', {
      unauthorized: (message = 'Unauthorized') => Object.assign(new Error(message), { statusCode: 401 }),
      forbidden: (message = 'Forbidden') => Object.assign(new Error(message), { statusCode: 403 }),
      notFound: (message = 'Not found') => Object.assign(new Error(message), { statusCode: 404 }),
      conflict: (message = 'Conflict') => Object.assign(new Error(message), { statusCode: 409 }),
    })
    await registerRoutes(app, pool, config, new StorageManager(pool, config.DATA_ENCRYPTION_KEY))

    const before = await app.inject({ method: 'GET', url: '/api/v1/setup/status' })
    assert.equal(before.statusCode, 200)
    assert.deepEqual(before.json(), { initialized: false, storageConfigured: false, setupAvailable: true, setupTokenRequired: true })

    const payload = {
      setupToken,
      email: 'owner@example.com',
      password: 'strong-password',
      name: 'Owner',
      workspaceName: 'Personal Workspace',
      storage: { driver: 'filesystem', filesystemPath: assetRoot },
    }
    const wrongToken = await app.inject({ method: 'POST', url: '/api/v1/setup', payload: { ...payload, setupToken: 'wrong-token-that-is-still-long-enough' } })
    assert.equal(wrongToken.statusCode, 401)

    const initialized = await app.inject({ method: 'POST', url: '/api/v1/setup', payload })
    assert.equal(initialized.statusCode, 201, initialized.body)
    const session = initialized.json<{ accessToken: string; workspaceId: string }>()
    assert.ok(session.accessToken)
    assert.ok(session.workspaceId)

    const after = await app.inject({ method: 'GET', url: '/api/v1/setup/status' })
    assert.deepEqual(after.json(), { initialized: true, storageConfigured: true, setupAvailable: true, setupTokenRequired: true })
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${session.accessToken}` } })
    assert.equal(me.statusCode, 200)
    assert.equal(me.json().isInstanceAdmin, true)

    const repeated = await app.inject({ method: 'POST', url: '/api/v1/setup', payload })
    assert.equal(repeated.statusCode, 409)
    await app.close()
  } finally {
    await db.close()
    await rm(assetRoot, { recursive: true, force: true })
  }
})
