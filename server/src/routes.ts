import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { Transform } from 'node:stream'
import bcrypt from 'bcryptjs'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { DatabasePool } from './db.js'
import { decryptJson, encryptJson } from './crypto.js'
import type { AppConfig } from './config.js'
import {
  createAttachmentSchema,
  createEntrySchema,
  createGroupSchema,
  createProjectSchema,
  createQuickEntrySchema,
  credentialsSchema,
  idParamsSchema,
  moveEntrySchema,
  projectParamsSchema,
  registerSchema,
  reorderEntrySchema,
  updateEntrySchema,
  updateGroupSchema,
  updateProjectSchema,
  updateQuickEntrySchema,
  workspaceParamsSchema,
  storageSettingsSchema,
  assetUploadQuerySchema,
  searchQuerySchema,
  changePasswordSchema,
} from './schemas.js'
import { createAssetStorage, type StorageManager, type StorageSettings } from './storage.js'

type Role = 'owner' | 'admin' | 'editor' | 'viewer'
interface AuthUser { sub: string; email: string }
interface PasswordItem { id: string; name: string; valuePreview: string }

const roleWeight: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 }

function authUser(request: FastifyRequest) {
  return request.user as AuthUser
}

async function workspaceRole(pool: DatabasePool, userId: string, workspaceId: string) {
  const result = await pool.query<{ role: Role }>(
    `SELECT role FROM workspace_members
     WHERE workspace_id = $1 AND user_id = $2 AND status = 'joined'`,
    [workspaceId, userId],
  )
  return result.rows[0]?.role
}

async function requireInstanceAdmin(app: FastifyInstance, pool: DatabasePool, request: FastifyRequest) {
  const result = await pool.query<{ is_instance_admin: boolean }>('SELECT is_instance_admin FROM users WHERE id = $1', [authUser(request).sub])
  if (!result.rows[0]?.is_instance_admin) throw app.httpErrors.forbidden('仅服务实例管理员可以修改物理存储配置')
}

async function requireWorkspace(
  app: FastifyInstance,
  pool: DatabasePool,
  request: FastifyRequest,
  workspaceId: string,
  minimum: Role = 'viewer',
) {
  const role = await workspaceRole(pool, authUser(request).sub, workspaceId)
  if (!role || roleWeight[role] < roleWeight[minimum]) throw app.httpErrors.forbidden('Workspace access denied')
  return role
}

async function projectWorkspace(app: FastifyInstance, pool: DatabasePool, projectId: string) {
  const result = await pool.query<{ workspace_id: string }>('SELECT workspace_id FROM projects WHERE id = $1', [projectId])
  const workspaceId = result.rows[0]?.workspace_id
  if (!workspaceId) throw app.httpErrors.notFound('Project not found')
  return workspaceId
}

async function entryWorkspace(app: FastifyInstance, pool: DatabasePool, entryId: string) {
  const result = await pool.query<{ workspace_id: string }>(
    `SELECT p.workspace_id FROM knowledge_entries e JOIN projects p ON p.id = e.project_id WHERE e.id = $1`,
    [entryId],
  )
  const workspaceId = result.rows[0]?.workspace_id
  if (!workspaceId) throw app.httpErrors.notFound('Entry not found')
  return workspaceId
}

async function groupWorkspace(app: FastifyInstance, pool: DatabasePool, groupId: string) {
  const result = await pool.query<{ workspace_id: string }>(
    `SELECT p.workspace_id FROM knowledge_groups g JOIN projects p ON p.id = g.project_id WHERE g.id = $1`,
    [groupId],
  )
  const workspaceId = result.rows[0]?.workspace_id
  if (!workspaceId) throw app.httpErrors.notFound('Group not found')
  return workspaceId
}

function mapWorkspace(row: Record<string, unknown>, config: AppConfig) {
  return {
    id: row.id,
    type: 'service',
    deployment: config.DEPLOYMENT_MODE,
    name: row.name,
    description: row.description,
    status: 'online',
  }
}

function mapProject(row: Record<string, unknown>) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    tag: row.tag,
    entryCount: Number(row.entry_count ?? 0),
    updatedAtText: formatRelativeDate(row.updated_at),
    tone: row.tone,
  }
}

function formatRelativeDate(value: unknown) {
  const date = new Date(String(value))
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 60 * 60_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))} 小时前`
  if (diff < 48 * 60 * 60_000) return '昨天'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function mapAttachment(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    targetType: row.target_type,
    target: row.target,
    assetId: row.asset_id ?? undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  }
}

function mapQuickEntry(row: Record<string, unknown>) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    targetType: row.target_type,
    target: row.target,
    published: row.published,
    sortOrder: row.sort_order,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

function mapEntry(row: Record<string, unknown>, config: AppConfig) {
  return {
    id: row.id,
    projectId: row.project_id,
    groupId: row.group_id,
    parentEntryId: row.parent_entry_id ?? undefined,
    type: row.type,
    title: row.title,
    icon: row.icon ?? undefined,
    remark: row.remark,
    tags: row.tags ?? [],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    textContent: row.text_content ?? undefined,
    passwordItems: decryptJson<PasswordItem[]>(row.password_items_encrypted as string | null, config.DATA_ENCRYPTION_KEY),
    linkItems: row.link_items ?? undefined,
  }
}

function mapAsset(row: Record<string, unknown>) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    storedUrl: `deek-asset://service/${row.id}`,
    createdAt: new Date(String(row.created_at)).toISOString(),
  }
}

function sanitizeObjectName(value: string) {
  const normalized = value.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
  return (normalized || 'asset.bin').slice(-180)
}

async function resolveStorageSettings(
  storageManager: StorageManager,
  input:
    | { driver: 'filesystem'; filesystemPath: string }
    | { driver: 's3'; endpoint: string; region: string; bucket: string; forcePathStyle: boolean; accessKey?: string; secretKey?: string },
): Promise<StorageSettings> {
  if (input.driver === 'filesystem') return input
  const current = await storageManager.readSettings()
  const currentCredentials = current?.driver === 's3' ? current.credentials : undefined
  const accessKey = input.accessKey?.trim() || currentCredentials?.accessKey
  const secretKey = input.secretKey?.trim() || currentCredentials?.secretKey
  if (!accessKey || !secretKey) {
    throw Object.assign(new Error('首次配置 RustFS/S3 时必须填写 Access Key 和 Secret Key'), { statusCode: 400 })
  }
  return {
    driver: 's3',
    endpoint: input.endpoint.replace(/\/$/, ''),
    region: input.region,
    bucket: input.bucket,
    forcePathStyle: input.forcePathStyle,
    credentials: { accessKey, secretKey },
  }
}

function serviceAssetIds(...values: unknown[]) {
  const ids = new Set<string>()
  const pattern = /deek-asset:\/\/service\/([0-9a-f-]{36})/gi
  for (const value of values) {
    for (const match of String(value ?? '').matchAll(pattern)) if (match[1]) ids.add(match[1].toLowerCase())
  }
  return [...ids]
}

function isSameStorageLocation(current: StorageSettings, next: StorageSettings) {
  if (current.driver !== next.driver) return false
  if (current.driver === 'filesystem' && next.driver === 'filesystem') {
    return path.resolve(current.filesystemPath) === path.resolve(next.filesystemPath)
  }
  if (current.driver === 's3' && next.driver === 's3') {
    return current.endpoint === next.endpoint && current.region === next.region && current.bucket === next.bucket && current.forcePathStyle === next.forcePathStyle
  }
  return false
}

async function cleanupAssetIds(pool: DatabasePool, storageManager: StorageManager, assetIds: Iterable<string>) {
  const candidates = [...new Set(assetIds)]
  if (candidates.length === 0) return
  const storage = await storageManager.getStorage()
  for (const id of candidates) {
    const references = await pool.query<{ referenced: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM project_attachments WHERE asset_id = $1
         UNION ALL
         SELECT 1 FROM knowledge_entries WHERE position('deek-asset://service/' || $1::text in coalesce(text_content, '')) > 0
       ) AS referenced`,
      [id],
    )
    if (references.rows[0]?.referenced) continue
    const asset = (await pool.query<{ id: string; object_key: string }>(
      "SELECT id, object_key FROM assets WHERE id = $1 AND status = 'ready'",
      [id],
    )).rows[0]
    if (!asset) continue
    await storage.delete(asset.object_key)
    await pool.query("UPDATE assets SET status = 'deleted', deleted_at = now(), updated_at = now() WHERE id = $1", [asset.id])
  }
}

export async function registerRoutes(app: FastifyInstance, pool: DatabasePool, config: AppConfig, storageManager: StorageManager) {
  app.get('/health', async () => {
    await pool.query('SELECT 1')
    return { status: 'ok', service: 'deek-pm-server', version: '0.1.0' }
  })

  app.register(async (api) => {
    api.get('/instance', async () => ({
      name: config.INSTANCE_NAME,
      deployment: config.DEPLOYMENT_MODE,
      version: '0.1.0',
      registrationEnabled: config.ALLOW_REGISTRATION,
    }))

    api.post('/auth/login', async (request) => {
      const input = credentialsSchema.parse(request.body)
      const result = await pool.query<{ id: string; email: string; name: string; password_hash: string }>(
        'SELECT id, email, name, password_hash FROM users WHERE lower(email) = $1',
        [input.email],
      )
      const user = result.rows[0]
      if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
        throw app.httpErrors.unauthorized('Invalid email or password')
      }
      const accessToken = await app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: '12h' })
      return { accessToken, user: { id: user.id, email: user.email, name: user.name } }
    })

    api.post('/auth/register', async (request, reply) => {
      if (!config.ALLOW_REGISTRATION) throw app.httpErrors.forbidden('Registration is disabled')
      const input = registerSchema.parse(request.body)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const userId = randomUUID()
        const workspaceId = randomUUID()
        await client.query('INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)', [
          userId,
          input.email,
          input.name,
          await bcrypt.hash(input.password, 12),
        ])
        await client.query('INSERT INTO workspaces (id, name, description) VALUES ($1, $2, $3)', [workspaceId, input.workspaceName, ''])
        await client.query(
          `INSERT INTO workspace_members (id, workspace_id, user_id, email, name, role, status)
           VALUES ($1, $2, $3, $4, $5, 'owner', 'joined')`,
          [randomUUID(), workspaceId, userId, input.email, input.name],
        )
        await client.query('COMMIT')
        const accessToken = await app.jwt.sign({ sub: userId, email: input.email }, { expiresIn: '12h' })
        return reply.code(201).send({ accessToken, user: { id: userId, email: input.email, name: input.name } })
      } catch (error: unknown) {
        await client.query('ROLLBACK')
        if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
          throw app.httpErrors.conflict('Email already exists')
        }
        throw error
      } finally {
        client.release()
      }
    })

    api.register(async (protectedApi) => {
      protectedApi.addHook('onRequest', async (request) => request.jwtVerify())

      protectedApi.get('/auth/me', async (request) => {
        const result = await pool.query('SELECT id, email, name, is_instance_admin AS "isInstanceAdmin" FROM users WHERE id = $1', [authUser(request).sub])
        if (!result.rows[0]) throw app.httpErrors.unauthorized()
        return result.rows[0]
      })

      protectedApi.post('/auth/change-password', async (request) => {
        const input = changePasswordSchema.parse(request.body)
        const result = await pool.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [authUser(request).sub])
        if (!result.rows[0] || !(await bcrypt.compare(input.currentPassword, result.rows[0].password_hash))) {
          throw app.httpErrors.unauthorized('当前密码不正确')
        }
        await pool.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
          authUser(request).sub,
          await bcrypt.hash(input.newPassword, 12),
        ])
        return { ok: true }
      })

      protectedApi.get('/storage/settings', async (request) => {
        await requireInstanceAdmin(app, pool, request)
        if (config.DEPLOYMENT_MODE === 'cloud') throw app.httpErrors.forbidden('官方托管实例的物理存储由运营环境统一配置')
        const settings = await storageManager.readSettings()
        if (!settings) return { configured: false }
        if (settings.driver === 'filesystem') {
          return { configured: true, driver: 'filesystem', filesystemPath: settings.filesystemPath, updatedAt: settings.updatedAt }
        }
        return {
          configured: true,
          driver: 's3',
          endpoint: settings.endpoint,
          region: settings.region,
          bucket: settings.bucket,
          forcePathStyle: settings.forcePathStyle,
          hasCredentials: true,
          updatedAt: settings.updatedAt,
        }
      })

      protectedApi.post('/storage/settings/test', async (request) => {
        await requireInstanceAdmin(app, pool, request)
        if (config.DEPLOYMENT_MODE === 'cloud') throw app.httpErrors.forbidden('官方托管实例的物理存储由运营环境统一配置')
        const settings = await resolveStorageSettings(storageManager, storageSettingsSchema.parse(request.body))
        await createAssetStorage(settings).verifyWritable()
        return { ok: true }
      })

      protectedApi.put('/storage/settings', async (request) => {
        await requireInstanceAdmin(app, pool, request)
        if (config.DEPLOYMENT_MODE === 'cloud') throw app.httpErrors.forbidden('官方托管实例的物理存储由运营环境统一配置')
        const settings = await resolveStorageSettings(storageManager, storageSettingsSchema.parse(request.body))
        await createAssetStorage(settings).verifyWritable()
        const currentSettings = await storageManager.readSettings()
        if (currentSettings && !isSameStorageLocation(currentSettings, settings)) {
          const assets = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM assets WHERE status = 'ready'")
          if ((assets.rows[0]?.count ?? 0) > 0) {
            throw app.httpErrors.conflict('已有托管文件，不能直接更换物理存储位置；请先完成存储迁移')
          }
        }
        const credentialsEncrypted = settings.driver === 's3'
          ? encryptJson(settings.credentials, config.DATA_ENCRYPTION_KEY)
          : null
        await pool.query(
          `INSERT INTO storage_settings (
             id, driver, filesystem_path, s3_endpoint, s3_region, s3_bucket,
             s3_force_path_style, credentials_encrypted, updated_by, updated_at
           ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, now())
           ON CONFLICT (id) DO UPDATE SET
             driver = EXCLUDED.driver,
             filesystem_path = EXCLUDED.filesystem_path,
             s3_endpoint = EXCLUDED.s3_endpoint,
             s3_region = EXCLUDED.s3_region,
             s3_bucket = EXCLUDED.s3_bucket,
             s3_force_path_style = EXCLUDED.s3_force_path_style,
             credentials_encrypted = EXCLUDED.credentials_encrypted,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()`,
          [
            settings.driver,
            settings.driver === 'filesystem' ? settings.filesystemPath : null,
            settings.driver === 's3' ? settings.endpoint : null,
            settings.driver === 's3' ? settings.region : null,
            settings.driver === 's3' ? settings.bucket : null,
            settings.driver === 's3' ? settings.forcePathStyle : true,
            credentialsEncrypted,
            authUser(request).sub,
          ],
        )
        return { ok: true }
      })

      protectedApi.post('/assets/upload', async (request, reply) => {
        const { workspaceId, kind } = assetUploadQuerySchema.parse(request.query)
        await requireWorkspace(app, pool, request, workspaceId, 'editor')
        const file = await request.file()
        if (!file) throw Object.assign(new Error('请选择要上传的文件'), { statusCode: 400 })
        const mimeType = file.mimetype || 'application/octet-stream'
        if (kind === 'image' && !/^image\/(png|jpeg|gif|webp|avif)$/i.test(mimeType)) {
          throw Object.assign(new Error('正文图片仅支持 PNG、JPEG、GIF、WebP 和 AVIF'), { statusCode: 400 })
        }
        const assetId = randomUUID()
        const safeName = sanitizeObjectName(file.filename || 'asset.bin')
        const objectKey = `workspaces/${workspaceId}/${assetId}/${safeName}`
        const hash = createHash('sha256')
        let sizeBytes = 0
        const hashStream = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            sizeBytes += chunk.length
            hash.update(chunk)
            callback(null, chunk)
          },
        })
        const storage = await storageManager.getStorage()
        await pool.query(
          `INSERT INTO assets (id, workspace_id, uploader_id, kind, original_name, mime_type, object_key, status, sha256)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', '')`,
          [assetId, workspaceId, authUser(request).sub, kind, file.filename || safeName, mimeType, objectKey],
        )
        try {
          await storage.put(objectKey, file.file.pipe(hashStream), mimeType)
          if (file.file.truncated) throw Object.assign(new Error('文件超过服务端允许的大小'), { statusCode: 413 })
          const sha256 = hash.digest('hex')
          const duplicate = await pool.query(
            `SELECT * FROM assets WHERE workspace_id = $1 AND sha256 = $2 AND status = 'ready' AND id <> $3 LIMIT 1`,
            [workspaceId, sha256, assetId],
          )
          if (duplicate.rows[0]) {
            await storage.delete(objectKey)
            await pool.query('DELETE FROM assets WHERE id = $1', [assetId])
            return reply.code(200).send(mapAsset(duplicate.rows[0]))
          }
          const result = await pool.query(
            `UPDATE assets SET status = 'ready', size_bytes = $2, sha256 = $3, updated_at = now()
             WHERE id = $1 RETURNING *`,
            [assetId, sizeBytes, sha256],
          )
          return reply.code(201).send(mapAsset(result.rows[0]!))
        } catch (error) {
          await storage.delete(objectKey).catch(() => undefined)
          await pool.query('DELETE FROM assets WHERE id = $1', [assetId])
          throw error
        }
      })

      protectedApi.get('/assets/:id/content', async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params)
        const result = await pool.query('SELECT * FROM assets WHERE id = $1 AND status = \'ready\'', [id])
        const asset = result.rows[0]
        if (!asset) throw app.httpErrors.notFound('文件不存在')
        await requireWorkspace(app, pool, request, asset.workspace_id)
        const stored = await (await storageManager.getStorage()).get(asset.object_key)
        reply.header('Content-Type', stored.contentType ?? asset.mime_type)
        if (stored.contentLength) reply.header('Content-Length', stored.contentLength)
        reply.header('Cache-Control', 'private, max-age=300')
        reply.header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(asset.original_name)}`)
        return reply.send(stored.body)
      })

      protectedApi.delete('/assets/:id', async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params)
        const result = await pool.query('SELECT * FROM assets WHERE id = $1 AND status = \'ready\'', [id])
        const asset = result.rows[0]
        if (!asset) return reply.code(204).send()
        await requireWorkspace(app, pool, request, asset.workspace_id, 'editor')
        const referenced = await pool.query<{ referenced: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM project_attachments WHERE asset_id = $1
             UNION ALL
             SELECT 1 FROM knowledge_entries WHERE text_content LIKE $2
           ) AS referenced`,
          [id, `%deek-asset://service/${id}%`],
        )
        if (referenced.rows[0]?.referenced) return reply.code(204).send()
        await (await storageManager.getStorage()).delete(asset.object_key)
        await pool.query("UPDATE assets SET status = 'deleted', deleted_at = now(), updated_at = now() WHERE id = $1", [id])
        return reply.code(204).send()
      })

      protectedApi.get('/workspaces', async (request) => {
        const result = await pool.query(
          `SELECT w.* FROM workspaces w
           JOIN workspace_members m ON m.workspace_id = w.id
           WHERE m.user_id = $1 AND m.status = 'joined'
           ORDER BY w.updated_at DESC`,
          [authUser(request).sub],
        )
        return result.rows.map((row) => mapWorkspace(row, config))
      })

      protectedApi.get('/workspaces/:id', async (request) => {
        const { id } = idParamsSchema.parse(request.params)
        await requireWorkspace(app, pool, request, id)
        const result = await pool.query('SELECT * FROM workspaces WHERE id = $1', [id])
        return mapWorkspace(result.rows[0]!, config)
      })

      protectedApi.get('/workspaces/:workspaceId/projects', async (request) => {
        const { workspaceId } = workspaceParamsSchema.parse(request.params)
        await requireWorkspace(app, pool, request, workspaceId)
        const result = await pool.query(
          `SELECT p.*, count(e.id)::int AS entry_count FROM projects p
           LEFT JOIN knowledge_entries e ON e.project_id = p.id
           WHERE p.workspace_id = $1 GROUP BY p.id ORDER BY p.updated_at DESC`,
          [workspaceId],
        )
        return result.rows.map(mapProject)
      })

      protectedApi.get('/projects/:id', async (request) => {
        const { id } = idParamsSchema.parse(request.params)
        await requireWorkspace(app, pool, request, await projectWorkspace(app, pool, id))
        const result = await pool.query(
          `SELECT p.*, count(e.id)::int AS entry_count FROM projects p
           LEFT JOIN knowledge_entries e ON e.project_id = p.id WHERE p.id = $1 GROUP BY p.id`,
          [id],
        )
        return mapProject(result.rows[0]!)
      })

      protectedApi.post('/projects', async (request, reply) => {
        const input = createProjectSchema.parse(request.body)
        await requireWorkspace(app, pool, request, input.workspaceId, 'editor')
        const result = await pool.query(
          `INSERT INTO projects (id, workspace_id, name, description, tag, tone)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *, 0::int AS entry_count`,
          [randomUUID(), input.workspaceId, input.name, input.description, input.tag, input.tone],
        )
        return reply.code(201).send(mapProject(result.rows[0]!))
      })

      protectedApi.patch('/projects/:id', async (request) => {
        const { id } = idParamsSchema.parse(request.params)
        await requireWorkspace(app, pool, request, await projectWorkspace(app, pool, id), 'editor')
        const input = updateProjectSchema.parse(request.body)
        const current = await pool.query('SELECT * FROM projects WHERE id = $1', [id])
        const row = current.rows[0]!
        const result = await pool.query(
          `UPDATE projects SET name = $2, description = $3, tag = $4, tone = $5, updated_at = now()
           WHERE id = $1 RETURNING *, (SELECT count(*)::int FROM knowledge_entries WHERE project_id = $1) AS entry_count`,
          [id, input.name ?? row.name, input.description ?? row.description, input.tag ?? row.tag, input.tone ?? row.tone],
        )
        return mapProject(result.rows[0]!)
      })

      protectedApi.delete('/projects/:id', async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params)
        const workspaceId = await projectWorkspace(app, pool, id)
        await requireWorkspace(app, pool, request, workspaceId, 'editor')
        const [entryAssets, attachmentAssets] = await Promise.all([
          pool.query<{ text_content: string | null }>('SELECT text_content FROM knowledge_entries WHERE project_id = $1', [id]),
          pool.query<{ asset_id: string | null }>('SELECT asset_id FROM project_attachments WHERE project_id = $1 AND asset_id IS NOT NULL', [id]),
        ])
        const assetIds = [
          ...serviceAssetIds(...entryAssets.rows.map((row) => row.text_content)),
          ...attachmentAssets.rows.flatMap((row) => row.asset_id ? [row.asset_id] : []),
        ]
        await pool.query('DELETE FROM projects WHERE id = $1', [id])
        await cleanupAssetIds(pool, storageManager, assetIds)
        return reply.code(204).send()
      })

      protectedApi.get('/projects/:projectId/groups', async (request) => {
        const { projectId } = projectParamsSchema.parse(request.params)
        await requireWorkspace(app, pool, request, await projectWorkspace(app, pool, projectId))
        const [groups, entries] = await Promise.all([
          pool.query('SELECT * FROM knowledge_groups WHERE project_id = $1 ORDER BY sort_order, created_at', [projectId]),
          pool.query('SELECT id, group_id, parent_entry_id, title, type, icon FROM knowledge_entries WHERE project_id = $1 ORDER BY sort_order, created_at', [projectId]),
        ])
        return groups.rows.map((group) => ({
          id: group.id,
          projectId: group.project_id,
          name: group.name,
          parentGroupId: group.parent_group_id ?? undefined,
          entries: entries.rows.filter((entry) => entry.group_id === group.id).map((entry) => ({
            id: entry.id,
            title: entry.title,
            type: entry.type,
            icon: entry.icon ?? undefined,
            parentEntryId: entry.parent_entry_id ?? undefined,
          })),
        }))
      })

      protectedApi.get('/projects/:projectId/search', async (request) => {
        const { projectId } = projectParamsSchema.parse(request.params)
        const { q } = searchQuerySchema.parse(request.query)
        await requireWorkspace(app, pool, request, await projectWorkspace(app, pool, projectId))
        const result = await pool.query<{ id: string }>(
          `SELECT id FROM knowledge_entries
           WHERE project_id = $1
             AND lower(concat_ws(' ', title, remark, tags::text, coalesce(text_content, ''), coalesce(link_items::text, ''))) LIKE $2
           ORDER BY updated_at DESC LIMIT 500`,
          [projectId, `%${q.toLocaleLowerCase()}%`],
        )
        return result.rows.map((row) => row.id)
      })

      protectedApi.post('/groups', async (request, reply) => {
        const input = createGroupSchema.parse(request.body)
        await requireWorkspace(app, pool, request, await projectWorkspace(app, pool, input.projectId), 'editor')
        if (input.parentGroupId) {
          const parent = await pool.query<{ project_id: string }>('SELECT project_id FROM knowledge_groups WHERE id = $1', [input.parentGroupId])
          if (parent.rows[0]?.project_id !== input.projectId) throw app.httpErrors.forbidden('Parent group must belong to the same project')
        }
        const nextOrder = await pool.query<{ value: number }>('SELECT coalesce(max(sort_order), -1) + 1 AS value FROM knowledge_groups WHERE project_id = $1', [input.projectId])
        const result = await pool.query(
          `INSERT INTO knowledge_groups (id, project_id, parent_group_id, name, sort_order)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [randomUUID(), input.projectId, input.parentGroupId ?? null, input.name, nextOrder.rows[0]!.value],
        )
        const row = result.rows[0]!
        return reply.code(201).send({ id: row.id, projectId: row.project_id, name: row.name, parentGroupId: row.parent_group_id ?? undefined, entries: [] })
      })

      protectedApi.patch('/groups/:id', async (request) => {
        const { id } = idParamsSchema.parse(request.params)
        await requireWorkspace(app, pool, request, await groupWorkspace(app, pool, id), 'editor')
        const input = updateGroupSchema.parse(request.body)
        const result = await pool.query('UPDATE knowledge_groups SET name = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, input.name])
        const row = result.rows[0]!
        return { id: row.id, projectId: row.project_id, name: row.name, parentGroupId: row.parent_group_id ?? undefined, entries: [] }
      })

      protectedApi.delete('/groups/:id', async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params)
        const workspaceId = await groupWorkspace(app, pool, id)
        await requireWorkspace(app, pool, request, workspaceId, 'editor')
        const entries = await pool.query<{ text_content: string | null }>(
          `WITH RECURSIVE descendants AS (
             SELECT id FROM knowledge_groups WHERE id = $1
             UNION ALL
             SELECT g.id FROM knowledge_groups g JOIN descendants d ON g.parent_group_id = d.id
           )
           SELECT e.text_content FROM knowledge_entries e JOIN descendants d ON d.id = e.group_id`,
          [id],
        )
        const assetIds = serviceAssetIds(...entries.rows.map((row) => row.text_content))
        await pool.query('DELETE FROM knowledge_groups WHERE id = $1', [id])
        await cleanupAssetIds(pool, storageManager, assetIds)
        return reply.code(204).send()
      })

      protectedApi.get('/entries/:id', async (request) => {
        const { id } = idParamsSchema.parse(request.params)
        await requireWorkspace(app, pool, request, await entryWorkspace(app, pool, id))
        const result = await pool.query('SELECT * FROM knowledge_entries WHERE id = $1', [id])
        return mapEntry(result.rows[0]!, config)
      })

      protectedApi.post('/entries', async (request, reply) => {
        const input = createEntrySchema.parse(request.body)
        await requireWorkspace(app, pool, request, await projectWorkspace(app, pool, input.projectId), 'editor')
        const group = await pool.query<{ project_id: string }>('SELECT project_id FROM knowledge_groups WHERE id = $1', [input.groupId])
        if (group.rows[0]?.project_id !== input.projectId) throw app.httpErrors.forbidden('Group must belong to the same project')
        const nextOrder = await pool.query<{ value: number }>('SELECT coalesce(max(sort_order), -1) + 1 AS value FROM knowledge_entries WHERE group_id = $1', [input.groupId])
        const result = await pool.query(
          `INSERT INTO knowledge_entries (id, project_id, group_id, parent_entry_id, type, title, icon, remark, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [randomUUID(), input.projectId, input.groupId, input.parentEntryId ?? null, input.type, input.title, input.icon ?? null, input.remark, nextOrder.rows[0]!.value],
        )
        await pool.query('UPDATE projects SET updated_at = now() WHERE id = $1', [input.projectId])
        return reply.code(201).send(mapEntry(result.rows[0]!, config))
      })

      protectedApi.patch('/entries/:id', async (request) => {
        const { id } = idParamsSchema.parse(request.params)
        const workspaceId = await entryWorkspace(app, pool, id)
        await requireWorkspace(app, pool, request, workspaceId, 'editor')
        const input = updateEntrySchema.parse(request.body)
        const current = (await pool.query('SELECT * FROM knowledge_entries WHERE id = $1', [id])).rows[0]!
        const result = await pool.query(
          `UPDATE knowledge_entries SET parent_entry_id = $2, title = $3, icon = $4, remark = $5,
             tags = $6, text_content = $7, password_items_encrypted = $8, link_items = $9, updated_at = now()
           WHERE id = $1 RETURNING *`,
          [
            id,
            input.parentEntryId === undefined ? current.parent_entry_id : input.parentEntryId,
            input.title ?? current.title,
            input.icon === undefined ? current.icon : input.icon,
            input.remark ?? current.remark,
            JSON.stringify(input.tags ?? current.tags),
            input.textContent ?? current.text_content,
            input.passwordItems === undefined ? current.password_items_encrypted : encryptJson(input.passwordItems, config.DATA_ENCRYPTION_KEY),
            input.linkItems === undefined ? current.link_items : JSON.stringify(input.linkItems),
          ],
        )
        await pool.query('UPDATE projects SET updated_at = now() WHERE id = $1', [current.project_id])
        if (input.textContent !== undefined) {
          const nextIds = new Set(serviceAssetIds(input.textContent))
          await cleanupAssetIds(pool, storageManager, serviceAssetIds(current.text_content).filter((assetId) => !nextIds.has(assetId)))
        }
        return mapEntry(result.rows[0]!, config)
      })

      protectedApi.delete('/entries/:id', async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params)
        const workspaceId = await entryWorkspace(app, pool, id)
        await requireWorkspace(app, pool, request, workspaceId, 'editor')
        const entries = await pool.query<{ text_content: string | null }>(
          `WITH RECURSIVE descendants AS (
             SELECT id, text_content FROM knowledge_entries WHERE id = $1
             UNION ALL
             SELECT e.id, e.text_content FROM knowledge_entries e JOIN descendants d ON e.parent_entry_id = d.id
           ) SELECT text_content FROM descendants`,
          [id],
        )
        const assetIds = serviceAssetIds(...entries.rows.map((row) => row.text_content))
        await pool.query('DELETE FROM knowledge_entries WHERE id = $1', [id])
        await cleanupAssetIds(pool, storageManager, assetIds)
        return reply.code(204).send()
      })

      protectedApi.post('/entries/:id/move', async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params)
        await requireWorkspace(app, pool, request, await entryWorkspace(app, pool, id), 'editor')
        const { targetGroupId } = moveEntrySchema.parse(request.body)
        const relation = await pool.query<{ entry_project_id: string; group_project_id: string }>(
          `SELECT e.project_id AS entry_project_id, g.project_id AS group_project_id
           FROM knowledge_entries e CROSS JOIN knowledge_groups g WHERE e.id = $1 AND g.id = $2`,
          [id, targetGroupId],
        )
        if (!relation.rows[0] || relation.rows[0].entry_project_id !== relation.rows[0].group_project_id) {
          throw app.httpErrors.forbidden('Target group must belong to the same project')
        }
        await pool.query('UPDATE knowledge_entries SET group_id = $2, parent_entry_id = NULL, updated_at = now() WHERE id = $1', [id, targetGroupId])
        return reply.code(204).send()
      })

      protectedApi.post('/entries/:id/reorder', async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params)
        await requireWorkspace(app, pool, request, await entryWorkspace(app, pool, id), 'editor')
        const { direction } = reorderEntrySchema.parse(request.body)
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const current = (await client.query<{ group_id: string; sort_order: number }>('SELECT group_id, sort_order FROM knowledge_entries WHERE id = $1 FOR UPDATE', [id])).rows[0]!
          const operator = direction === 'up' ? '<' : '>'
          const ordering = direction === 'up' ? 'DESC' : 'ASC'
          const adjacent = await client.query<{ id: string; sort_order: number }>(
            `SELECT id, sort_order FROM knowledge_entries WHERE group_id = $1 AND sort_order ${operator} $2 ORDER BY sort_order ${ordering} LIMIT 1 FOR UPDATE`,
            [current.group_id, current.sort_order],
          )
          if (adjacent.rows[0]) {
            await client.query('UPDATE knowledge_entries SET sort_order = $2 WHERE id = $1', [id, adjacent.rows[0].sort_order])
            await client.query('UPDATE knowledge_entries SET sort_order = $2 WHERE id = $1', [adjacent.rows[0].id, current.sort_order])
          }
          await client.query('COMMIT')
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        } finally {
          client.release()
        }
        return reply.code(204).send()
      })

      protectedApi.get('/projects/:projectId/attachments', async (request) => {
        const { projectId } = projectParamsSchema.parse(request.params)
        await requireWorkspace(app, pool, request, await projectWorkspace(app, pool, projectId))
        const result = await pool.query('SELECT * FROM project_attachments WHERE project_id = $1 ORDER BY created_at DESC', [projectId])
        return result.rows.map(mapAttachment)
      })

      protectedApi.post('/attachments', async (request, reply) => {
        const input = createAttachmentSchema.parse(request.body)
        const workspaceId = await projectWorkspace(app, pool, input.projectId)
        await requireWorkspace(app, pool, request, workspaceId, 'editor')
        if (input.targetType === 'asset') {
          if (!input.assetId) throw Object.assign(new Error('托管附件缺少 assetId'), { statusCode: 400 })
          const asset = await pool.query<{ workspace_id: string }>('SELECT workspace_id FROM assets WHERE id = $1 AND status = \'ready\'', [input.assetId])
          if (asset.rows[0]?.workspace_id !== workspaceId) throw app.httpErrors.forbidden('附件资产不属于当前资料库')
        }
        const result = await pool.query(
          `INSERT INTO project_attachments (id, project_id, name, target_type, target, asset_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [randomUUID(), input.projectId, input.name, input.targetType, input.target, input.assetId ?? null],
        )
        return reply.code(201).send(mapAttachment(result.rows[0]!))
      })

      protectedApi.delete('/attachments/:id', async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params)
        const item = await pool.query<{ project_id: string; asset_id: string | null }>('SELECT project_id, asset_id FROM project_attachments WHERE id = $1', [id])
        if (!item.rows[0]) throw app.httpErrors.notFound('Attachment not found')
        const workspaceId = await projectWorkspace(app, pool, item.rows[0].project_id)
        await requireWorkspace(app, pool, request, workspaceId, 'editor')
        await pool.query('DELETE FROM project_attachments WHERE id = $1', [id])
        await cleanupAssetIds(pool, storageManager, item.rows[0].asset_id ? [item.rows[0].asset_id] : [])
        return reply.code(204).send()
      })

      protectedApi.get('/workspaces/:workspaceId/quick-entries', async (request) => {
        const { workspaceId } = workspaceParamsSchema.parse(request.params)
        await requireWorkspace(app, pool, request, workspaceId)
        const result = await pool.query('SELECT * FROM quick_entries WHERE workspace_id = $1 ORDER BY sort_order, created_at', [workspaceId])
        return result.rows.map(mapQuickEntry)
      })

      protectedApi.post('/quick-entries', async (request, reply) => {
        const input = createQuickEntrySchema.parse(request.body)
        await requireWorkspace(app, pool, request, input.workspaceId, 'editor')
        const nextOrder = await pool.query<{ value: number }>('SELECT coalesce(max(sort_order), -1) + 1 AS value FROM quick_entries WHERE workspace_id = $1', [input.workspaceId])
        const result = await pool.query(
          `INSERT INTO quick_entries (id, workspace_id, name, target_type, target, published, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [randomUUID(), input.workspaceId, input.name, input.targetType, input.target, input.published, nextOrder.rows[0]!.value],
        )
        return reply.code(201).send(mapQuickEntry(result.rows[0]!))
      })

      protectedApi.patch('/quick-entries/:id', async (request) => {
        const { id } = idParamsSchema.parse(request.params)
        const current = (await pool.query('SELECT * FROM quick_entries WHERE id = $1', [id])).rows[0]
        if (!current) throw app.httpErrors.notFound('Quick entry not found')
        await requireWorkspace(app, pool, request, current.workspace_id, 'editor')
        const input = updateQuickEntrySchema.parse(request.body)
        const result = await pool.query(
          `UPDATE quick_entries SET name = $2, target_type = $3, target = $4, published = $5, sort_order = $6, updated_at = now()
           WHERE id = $1 RETURNING *`,
          [id, input.name ?? current.name, input.targetType ?? current.target_type, input.target ?? current.target, input.published ?? current.published, input.sortOrder ?? current.sort_order],
        )
        return mapQuickEntry(result.rows[0]!)
      })

      protectedApi.delete('/quick-entries/:id', async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params)
        const item = await pool.query<{ workspace_id: string }>('SELECT workspace_id FROM quick_entries WHERE id = $1', [id])
        if (!item.rows[0]) throw app.httpErrors.notFound('Quick entry not found')
        await requireWorkspace(app, pool, request, item.rows[0].workspace_id, 'editor')
        await pool.query('DELETE FROM quick_entries WHERE id = $1', [id])
        return reply.code(204).send()
      })
    })
  }, { prefix: '/api/v1' })
}
