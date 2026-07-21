import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { createPool } from '../db.js'

const email = process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase()
const password = process.env.BOOTSTRAP_PASSWORD
const name = process.env.BOOTSTRAP_NAME?.trim() || 'Administrator'
const workspaceName = process.env.BOOTSTRAP_WORKSPACE?.trim() || 'My Workspace'

if (!email || !password || password.length < 8) {
  throw new Error('BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD (at least 8 characters) are required')
}

const pool = createPool()
const client = await pool.connect()
try {
  await client.query('BEGIN')
  const existing = await client.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email])
  if (existing.rowCount) {
    console.log(`User ${email} already exists; nothing changed.`)
  } else {
    const userId = randomUUID()
    const workspaceId = randomUUID()
    await client.query('INSERT INTO users (id, email, name, password_hash, is_instance_admin) VALUES ($1, $2, $3, $4, true)', [
      userId,
      email,
      name,
      await bcrypt.hash(password, 12),
    ])
    await client.query('INSERT INTO workspaces (id, name, description) VALUES ($1, $2, $3)', [
      workspaceId,
      workspaceName,
      'Deek PM workspace',
    ])
    await client.query(
      `INSERT INTO workspace_members (id, workspace_id, user_id, email, name, role, status)
       VALUES ($1, $2, $3, $4, $5, 'owner', 'joined')`,
      [randomUUID(), workspaceId, userId, email, name],
    )
    console.log(`Created owner ${email} and workspace ${workspaceName}.`)
  }
  await client.query('COMMIT')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
  await pool.end()
}
