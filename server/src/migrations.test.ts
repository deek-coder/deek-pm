import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const migrationsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations')

test('all PostgreSQL migrations apply in order and enforce asset/hierarchy invariants', async () => {
  const db = new PGlite()
  try {
    const files = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort()
    assert.deepEqual(files.slice(-3), ['006_asset_consistency.sql', '007_hierarchy_integrity.sql', '008_instance_setup.sql'])
    for (const file of files) await db.exec(await readFile(path.join(migrationsDirectory, file), 'utf8'))

    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('asset_references', 'asset_cleanup_jobs', 'instance_settings')
       ORDER BY table_name`,
    )
    assert.deepEqual(tables.rows.map((row) => row.table_name), ['asset_cleanup_jobs', 'asset_references', 'instance_settings'])

    const workspace = '00000000-0000-4000-8000-000000000001'
    const user = '00000000-0000-4000-8000-000000000002'
    const projectA = '00000000-0000-4000-8000-000000000003'
    const projectB = '00000000-0000-4000-8000-000000000004'
    const groupA = '00000000-0000-4000-8000-000000000005'
    await db.query('INSERT INTO workspaces (id, name) VALUES ($1, $2)', [workspace, 'Workspace'])
    await db.query('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)', [user, 'test@example.com', 'Test', 'hash'])
    await db.query('INSERT INTO projects (id, workspace_id, name) VALUES ($1, $2, $3), ($4, $2, $5)', [projectA, workspace, 'A', projectB, 'B'])
    await db.query('INSERT INTO knowledge_groups (id, project_id, name) VALUES ($1, $2, $3)', [groupA, projectA, 'Group A'])
    await assert.rejects(
      db.query('INSERT INTO knowledge_groups (id, project_id, parent_group_id, name) VALUES ($1, $2, $3, $4)', ['00000000-0000-4000-8000-000000000006', projectB, groupA, 'Invalid']),
    )

    const assetValues = [workspace, user, 'same-sha']
    await db.query(
      `INSERT INTO assets (id, workspace_id, uploader_id, kind, original_name, mime_type, sha256, object_key, status)
       VALUES ('00000000-0000-4000-8000-000000000007', $1, $2, 'image', 'a.png', 'image/png', $3, 'a', 'ready')`,
      assetValues,
    )
    await assert.rejects(
      db.query(
        `INSERT INTO assets (id, workspace_id, uploader_id, kind, original_name, mime_type, sha256, object_key, status)
         VALUES ('00000000-0000-4000-8000-000000000008', $1, $2, 'image', 'b.png', 'image/png', $3, 'b', 'ready')`,
        assetValues,
      ),
    )
  } finally {
    await db.close()
  }
})
