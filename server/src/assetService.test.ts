import assert from 'node:assert/strict'
import test from 'node:test'
import type { PoolClient } from 'pg'
import { serviceAssetIds, syncAssetReferences } from './assetService.js'

test('service asset references are parsed without duplicates', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000'
  assert.deepEqual(serviceAssetIds(`x deek-asset://service/${id}`, `deek-asset://service/${id}`), [id])
})

test('asset reference synchronization rejects assets outside the workspace', async () => {
  const client = {
    query: async (sql: string) => sql.startsWith('SELECT id FROM assets') ? { rows: [] } : { rows: [] },
  } as unknown as PoolClient
  await assert.rejects(
    syncAssetReferences(client, 'workspace-a', 'entry', '123e4567-e89b-12d3-a456-426614174001', ['123e4567-e89b-12d3-a456-426614174000']),
    /不属于当前资料库/,
  )
})
