import assert from 'node:assert/strict'
import test from 'node:test'
import { processAssetCleanupJobs } from './assetCleanup.js'
import type { DatabasePool } from './db.js'
import type { StorageManager } from './storage.js'

function createFakePool() {
  const state = {
    job: { id: 'job-1', assetId: 'asset-1', objectKey: 'objects/asset-1', status: 'pending', attempts: 0, lastError: null as string | null },
    assetStatus: 'deleting',
  }
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes('SELECT id, asset_id, object_key')) {
      if (!['pending', 'failed'].includes(state.job.status)) return { rows: [] }
      return { rows: [{ id: state.job.id, asset_id: state.job.assetId, object_key: state.job.objectKey }] }
    }
    if (sql.includes("SET status = 'processing'")) {
      state.job.status = 'processing'
      state.job.attempts += 1
    } else if (sql.includes("asset_cleanup_jobs SET status = 'done'")) {
      state.job.status = 'done'
      state.job.lastError = null
    } else if (sql.includes("assets SET status = 'deleted'")) {
      state.assetStatus = 'deleted'
    } else if (sql.includes("SET status = 'failed'")) {
      state.job.status = 'failed'
      state.job.lastError = String(values[1])
    }
    return { rows: [] }
  }
  const client = { query, release() {} }
  return { state, pool: { query, connect: async () => client } as unknown as DatabasePool }
}

test('asset cleanup marks metadata deleted after physical deletion', async () => {
  const { state, pool } = createFakePool()
  const deleted: string[] = []
  const storageManager = {
    getStorage: async () => ({ delete: async (objectKey: string) => { deleted.push(objectKey) } }),
  } as unknown as StorageManager

  const result = await processAssetCleanupJobs(pool, storageManager)

  assert.deepEqual(result, { completed: 1, failed: 0 })
  assert.deepEqual(deleted, ['objects/asset-1'])
  assert.equal(state.job.status, 'done')
  assert.equal(state.assetStatus, 'deleted')
})

test('asset cleanup keeps a retryable failed job when storage is unavailable', async () => {
  const { state, pool } = createFakePool()
  const storageManager = {
    getStorage: async () => ({ delete: async () => { throw new Error('S3 unavailable') } }),
  } as unknown as StorageManager

  const result = await processAssetCleanupJobs(pool, storageManager, 1)

  assert.deepEqual(result, { completed: 0, failed: 1 })
  assert.equal(state.job.status, 'failed')
  assert.equal(state.assetStatus, 'deleting')
  assert.match(state.job.lastError ?? '', /S3 unavailable/)
})
