import type { DatabasePool } from './db.js'
import type { StorageManager } from './storage.js'

interface CleanupJob {
  id: string
  assetId: string
  objectKey: string
}

async function claimCleanupJob(pool: DatabasePool): Promise<CleanupJob | null> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<{ id: string; asset_id: string; object_key: string }>(
      `SELECT id, asset_id, object_key
       FROM asset_cleanup_jobs
       WHERE (
         status = 'pending'
         OR (status = 'failed' AND updated_at < now() - make_interval(secs => least(300, greatest(5, attempts * 5))))
         OR (status = 'processing' AND updated_at < now() - interval '5 minutes')
       )
       ORDER BY updated_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    )
    const row = result.rows[0]
    if (!row) {
      await client.query('COMMIT')
      return null
    }
    await client.query(
      `UPDATE asset_cleanup_jobs
       SET status = 'processing', attempts = attempts + 1, updated_at = now()
       WHERE id = $1`,
      [row.id],
    )
    await client.query('COMMIT')
    return { id: row.id, assetId: row.asset_id, objectKey: row.object_key }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function processAssetCleanupJobs(pool: DatabasePool, storageManager: StorageManager, limit = 20) {
  await pool.query(
    `WITH candidates AS (
       SELECT a.id, a.object_key
       FROM assets a
       WHERE (
         (a.status = 'pending' AND a.updated_at < now() - interval '15 minutes')
         OR a.status = 'deleting'
       )
       AND NOT EXISTS (
         SELECT 1 FROM asset_cleanup_jobs j
         WHERE j.asset_id = a.id AND j.status IN ('pending', 'processing', 'failed')
       )
     ), inserted AS (
       INSERT INTO asset_cleanup_jobs (id, asset_id, object_key, status)
       SELECT gen_random_uuid(), id, object_key, 'pending' FROM candidates
       RETURNING asset_id
     )
     UPDATE assets SET status = 'deleting', updated_at = now()
     WHERE id IN (SELECT asset_id FROM inserted)`,
  )
  let completed = 0
  let failed = 0
  for (let index = 0; index < limit; index += 1) {
    const job = await claimCleanupJob(pool)
    if (!job) break
    try {
      const storage = await storageManager.getStorage()
      await storage.delete(job.objectKey)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query("UPDATE asset_cleanup_jobs SET status = 'done', last_error = NULL, updated_at = now() WHERE id = $1", [job.id])
        await client.query("UPDATE assets SET status = 'deleted', deleted_at = now(), updated_at = now() WHERE id = $1", [job.assetId])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
      completed += 1
    } catch (error) {
      await pool.query(
        `UPDATE asset_cleanup_jobs
         SET status = 'failed', last_error = $2, updated_at = now()
         WHERE id = $1`,
        [job.id, error instanceof Error ? error.message.slice(0, 2000) : 'Unknown cleanup error'],
      )
      failed += 1
    }
  }
  return { completed, failed }
}
