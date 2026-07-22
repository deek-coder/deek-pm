import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { DatabasePool } from './db.js'

export function serviceAssetIds(...values: unknown[]) {
  const ids = new Set<string>()
  const pattern = /deek-asset:\/\/service\/([0-9a-f-]{36})/gi
  for (const value of values) {
    for (const match of String(value ?? '').matchAll(pattern)) if (match[1]) ids.add(match[1].toLowerCase())
  }
  return [...ids]
}

export async function syncAssetReferences(
  client: PoolClient,
  workspaceId: string,
  ownerType: 'entry' | 'attachment',
  ownerId: string,
  assetIds: Iterable<string>,
) {
  const ids = [...new Set(assetIds)].sort()
  await client.query('DELETE FROM asset_references WHERE owner_type = $1 AND owner_id = $2', [ownerType, ownerId])
  if (ids.length === 0) return
  for (const id of ids) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`asset-reference:${id}`])
  const assets = await client.query<{ id: string }>(
    "SELECT id FROM assets WHERE id = ANY($1::uuid[]) AND workspace_id = $2 AND status = 'ready' FOR SHARE",
    [ids, workspaceId],
  )
  if (assets.rows.length !== ids.length) throw Object.assign(new Error('资产不存在、未就绪或不属于当前资料库'), { statusCode: 409 })
  for (const asset of assets.rows) {
    await client.query(
      `INSERT INTO asset_references (id, asset_id, workspace_id, owner_type, owner_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (asset_id, owner_type, owner_id) DO NOTHING`,
      [randomUUID(), asset.id, workspaceId, ownerType, ownerId],
    )
  }
}

export async function deleteOwnerAssetReferences(client: PoolClient, ownerType: 'entry' | 'attachment', ownerIds: string[]) {
  if (ownerIds.length === 0) return []
  const result = await client.query<{ asset_id: string }>(
    'DELETE FROM asset_references WHERE owner_type = $1 AND owner_id = ANY($2::uuid[]) RETURNING asset_id',
    [ownerType, ownerIds],
  )
  return result.rows.map((row) => row.asset_id)
}

export async function queueUnreferencedAssets(client: PoolClient, assetIds: Iterable<string>) {
  for (const id of [...new Set(assetIds)].sort()) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`asset-reference:${id}`])
    const asset = (await client.query<{ id: string; object_key: string }>(
      `SELECT a.id, a.object_key FROM assets a
       WHERE a.id = $1 AND a.status = 'ready'
         AND NOT EXISTS (SELECT 1 FROM asset_references r WHERE r.asset_id = a.id)
       FOR UPDATE`,
      [id],
    )).rows[0]
    if (!asset) continue
    await client.query("UPDATE assets SET status = 'deleting', updated_at = now() WHERE id = $1", [asset.id])
    await client.query(
      `INSERT INTO asset_cleanup_jobs (id, asset_id, object_key, status)
       SELECT $1, $2, $3, 'pending'
       WHERE NOT EXISTS (
         SELECT 1 FROM asset_cleanup_jobs WHERE asset_id = $2 AND status IN ('pending', 'processing', 'failed')
       )`,
      [randomUUID(), asset.id, asset.object_key],
    )
  }
}

export async function finalizeUploadedAsset(
  pool: DatabasePool,
  input: { assetId: string; workspaceId: string; objectKey: string; sha256: string; sizeBytes: number },
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${input.workspaceId}:${input.sha256}`])
    const duplicate = await client.query(
      `SELECT * FROM assets WHERE workspace_id = $1 AND sha256 = $2 AND status = 'ready' AND id <> $3 LIMIT 1`,
      [input.workspaceId, input.sha256, input.assetId],
    )
    if (duplicate.rows[0]) {
      await client.query(
        "UPDATE assets SET status = 'deleting', size_bytes = $2, sha256 = $3, updated_at = now() WHERE id = $1",
        [input.assetId, input.sizeBytes, input.sha256],
      )
      await client.query(
        "INSERT INTO asset_cleanup_jobs (id, asset_id, object_key, status) VALUES ($1, $2, $3, 'pending')",
        [randomUUID(), input.assetId, input.objectKey],
      )
      await client.query('COMMIT')
      return { asset: duplicate.rows[0], duplicate: true }
    }
    const result = await client.query(
      `UPDATE assets SET status = 'ready', size_bytes = $2, sha256 = $3, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [input.assetId, input.sizeBytes, input.sha256],
    )
    await client.query('COMMIT')
    return { asset: result.rows[0]!, duplicate: false }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function scheduleFailedAssetUploadCleanup(pool: DatabasePool, assetId: string) {
  await pool.query(
    `WITH changed AS (
       UPDATE assets SET status = 'deleting', updated_at = now() WHERE id = $1 RETURNING id, object_key
     )
     INSERT INTO asset_cleanup_jobs (id, asset_id, object_key, status)
     SELECT $2, id, object_key, 'pending' FROM changed
     WHERE NOT EXISTS (
       SELECT 1 FROM asset_cleanup_jobs WHERE asset_id = $1 AND status IN ('pending', 'processing', 'failed')
     )`,
    [assetId, randomUUID()],
  )
}
