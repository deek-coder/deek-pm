const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const Database = require('better-sqlite3-multiple-ciphers')

const databaseVersion = 8
const workspaceId = 'local-personal'
const fieldEncryptedPrefix = 'deek-field:v1:'

function createLocalDatabaseService({ app, safeStorage }) {
  const userDataPath = app.getPath('userData')
  const databasePath = path.join(userDataPath, 'deek-local-v1.db')
  const keyPath = path.join(userDataPath, 'deek-local-key.json')
  let db = null
  let unlockedDatabaseKey = null

  const getDb = () => {
    if (db) return db
    fs.mkdirSync(userDataPath, { recursive: true })
    const key = getDatabaseKey(keyPath, safeStorage, unlockedDatabaseKey)
    unlockedDatabaseKey = key
    db = new Database(databasePath)
    db.pragma('cipher = sqlcipher')
    db.pragma(`key = '${escapePragmaValue(key)}'`)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate(db)
    seedLocalWorkspace(db)
    removeSampleProjects(db)
    migrateSensitiveFields(db, key)
    return db
  }

  const close = () => {
    if (!db) return
    db.close()
    db = null
  }

  const getSecurityStatus = () => {
    const envelope = readKeyEnvelope(keyPath)
    if (!envelope) {
      const key = getDatabaseKey(keyPath, safeStorage, unlockedDatabaseKey)
      unlockedDatabaseKey = key
      return getSecurityStatus()
    }
    if (envelope.version !== 2 || envelope.mode !== 'master-password') {
      return {
        configured: false,
        locked: false,
        remembered: false,
        safeStorageAvailable: safeStorage.isEncryptionAvailable(),
        databasePath,
      }
    }

    const rememberedKey = readRememberedDatabaseKey(envelope, safeStorage)
    if (!unlockedDatabaseKey && rememberedKey) unlockedDatabaseKey = rememberedKey
    return {
      configured: true,
      locked: !unlockedDatabaseKey,
      remembered: Boolean(envelope.remembered),
      safeStorageAvailable: safeStorage.isEncryptionAvailable(),
      databasePath,
    }
  }

  const setMasterPassword = ({ password, remember }) => {
    assertPassword(password)
    const key = getDatabaseKey(keyPath, safeStorage, unlockedDatabaseKey)
    unlockedDatabaseKey = key
    writeMasterPasswordEnvelope(keyPath, safeStorage, key, password, Boolean(remember))
    return getSecurityStatus()
  }

  const unlock = ({ password, remember }) => {
    assertPassword(password)
    const envelope = readKeyEnvelope(keyPath)
    if (!envelope || envelope.version !== 2 || envelope.mode !== 'master-password') return getSecurityStatus()
    const key = decryptKeyWithPassword(envelope, password)
    unlockedDatabaseKey = key
    if (remember) writeMasterPasswordEnvelope(keyPath, safeStorage, key, password, true)
    return getSecurityStatus()
  }

  const lock = ({ forgetRemembered } = {}) => {
    const envelope = readKeyEnvelope(keyPath)
    if (forgetRemembered && envelope?.version === 2 && envelope.mode === 'master-password') {
      const nextEnvelope = { ...envelope }
      delete nextEnvelope.remembered
      writeKeyEnvelope(keyPath, nextEnvelope)
    }
    close()
    unlockedDatabaseKey = null
    return getSecurityStatus()
  }

  const disableMasterPassword = () => {
    const key = getDatabaseKey(keyPath, safeStorage, unlockedDatabaseKey)
    unlockedDatabaseKey = key
    writeLegacyKeyEnvelope(keyPath, safeStorage, key)
    return getSecurityStatus()
  }

  const clear = async () => {
    close()
    await removeIfExists(databasePath)
    await removeIfExists(`${databasePath}-wal`)
    await removeIfExists(`${databasePath}-shm`)
  }

  return {
    databasePath,
    keyPath,
    close,
    clear,
    getSecurityStatus,
    setMasterPassword,
    unlock,
    lock,
    disableMasterPassword,
    getAssetStorageSettings() {
      return getAssetStorageSettings(getDb(), unlockedDatabaseKey, true)
    },
    setAssetStorageSettings(settings) {
      return setAssetStorageSettings(getDb(), settings, unlockedDatabaseKey)
    },
    handle(action, payload) {
      return handleRepositoryAction(getDb(), action, payload, unlockedDatabaseKey)
    },
  }
}

function getDatabaseKey(keyPath, safeStorage, unlockedDatabaseKey) {
  if (unlockedDatabaseKey) return unlockedDatabaseKey
  const envelope = readKeyEnvelope(keyPath)
  if (envelope) {
    if (envelope.version === 2 && envelope.mode === 'master-password') {
      const rememberedKey = readRememberedDatabaseKey(envelope, safeStorage)
      if (rememberedKey) return rememberedKey
      const error = new Error('本地库已锁定，请输入主密码解锁')
      error.code = 'LOCAL_DATABASE_LOCKED'
      throw error
    }
    if (envelope.encrypted) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法解锁本地库密钥')
      return safeStorage.decryptString(Buffer.from(envelope.data, 'base64'))
    }
    return envelope.data
  }

  const key = crypto.randomBytes(32).toString('base64url')
  writeLegacyKeyEnvelope(keyPath, safeStorage, key)
  return key
}

function readKeyEnvelope(keyPath) {
  if (!fs.existsSync(keyPath)) return null
  return JSON.parse(fs.readFileSync(keyPath, 'utf8'))
}

function writeKeyEnvelope(keyPath, envelope) {
  fs.mkdirSync(path.dirname(keyPath), { recursive: true })
  fs.writeFileSync(keyPath, JSON.stringify(envelope), 'utf8')
}

function writeLegacyKeyEnvelope(keyPath, safeStorage, key) {
  const canEncrypt = safeStorage.isEncryptionAvailable()
  writeKeyEnvelope(
    keyPath,
    canEncrypt
      ? { version: 1, encrypted: true, data: safeStorage.encryptString(key).toString('base64') }
      : { version: 1, encrypted: false, data: key },
  )
}

function writeMasterPasswordEnvelope(keyPath, safeStorage, key, password, remember) {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const derivedKey = crypto.scryptSync(password, salt, 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv)
  const encrypted = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()])
  const envelope = {
    version: 2,
    mode: 'master-password',
    kdf: 'scrypt',
    cipher: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  }
  if (remember && safeStorage.isEncryptionAvailable()) {
    envelope.remembered = safeStorage.encryptString(key).toString('base64')
  }
  writeKeyEnvelope(keyPath, envelope)
}

function decryptKeyWithPassword(envelope, password) {
  try {
    const salt = Buffer.from(envelope.salt, 'base64')
    const iv = Buffer.from(envelope.iv, 'base64')
    const tag = Buffer.from(envelope.tag, 'base64')
    const data = Buffer.from(envelope.data, 'base64')
    const derivedKey = crypto.scryptSync(password, salt, 32)
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    const error = new Error('主密码不正确，无法解锁本地库')
    error.code = 'LOCAL_DATABASE_UNLOCK_FAILED'
    throw error
  }
}

function readRememberedDatabaseKey(envelope, safeStorage) {
  if (!envelope.remembered || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(envelope.remembered, 'base64'))
  } catch {
    return null
  }
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('主密码至少需要 8 个字符')
  }
}

function migrate(db) {
  const currentVersion = db.pragma('user_version', { simple: true })
  const migrateTransaction = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        deployment TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        service_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        tag TEXT NOT NULL,
        tone TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS knowledge_groups (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_group_id TEXT,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS knowledge_entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        group_id TEXT NOT NULL REFERENCES knowledge_groups(id) ON DELETE CASCADE,
        parent_entry_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        icon TEXT,
        remark TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS text_entry_contents (
        entry_id TEXT PRIMARY KEY REFERENCES knowledge_entries(id) ON DELETE CASCADE,
        content_format TEXT NOT NULL,
        content TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS password_entry_items (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        value_preview TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS link_entry_items (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_attachments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quick_entries (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target TEXT NOT NULL,
        published INTEGER NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS backup_records (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        encrypted INTEGER NOT NULL,
        algorithm TEXT NOT NULL,
        created_at TEXT NOT NULL,
        size INTEGER NOT NULL,
        note TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saved_service_connections (
        id TEXT PRIMARY KEY,
        base_url TEXT NOT NULL,
        deployment TEXT NOT NULL,
        account_email TEXT NOT NULL,
        instance_name TEXT NOT NULL,
        encrypted_access_token TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(base_url, account_email)
      );

      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('image', 'attachment')),
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        object_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'deleting', 'deleted', 'error')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(workspace_id, sha256)
      );

      CREATE TABLE IF NOT EXISTS asset_references (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        owner_type TEXT NOT NULL CHECK (owner_type IN ('entry', 'attachment')),
        owner_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(asset_id, owner_type, owner_id)
      );

      CREATE TABLE IF NOT EXISTS asset_cleanup_jobs (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        object_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'done', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_groups_project ON knowledge_groups(project_id, sort_order);
      CREATE INDEX IF NOT EXISTS idx_entries_project ON knowledge_entries(project_id, sort_order);
      CREATE INDEX IF NOT EXISTS idx_entries_group ON knowledge_entries(group_id, sort_order);
      CREATE INDEX IF NOT EXISTS idx_password_items_entry ON password_entry_items(entry_id, sort_order);
      CREATE INDEX IF NOT EXISTS idx_link_items_entry ON link_entry_items(entry_id, sort_order);
      CREATE INDEX IF NOT EXISTS idx_attachments_project ON project_attachments(project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_quick_entries_workspace ON quick_entries(workspace_id, published DESC, sort_order);
      CREATE INDEX IF NOT EXISTS idx_assets_workspace ON assets(workspace_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_asset_references_owner ON asset_references(owner_type, owner_id);
      CREATE INDEX IF NOT EXISTS idx_asset_cleanup_jobs_status ON asset_cleanup_jobs(status, updated_at);

      CREATE TRIGGER IF NOT EXISTS trg_groups_parent_same_project_insert
      BEFORE INSERT ON knowledge_groups
      WHEN NEW.parent_group_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM knowledge_groups parent WHERE parent.id = NEW.parent_group_id AND parent.project_id = NEW.project_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Parent group must belong to the same project');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_groups_parent_same_project_update
      BEFORE UPDATE OF parent_group_id, project_id ON knowledge_groups
      WHEN NEW.parent_group_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM knowledge_groups parent WHERE parent.id = NEW.parent_group_id AND parent.project_id = NEW.project_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Parent group must belong to the same project');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_entries_relations_insert
      BEFORE INSERT ON knowledge_entries
      WHEN NOT EXISTS (
        SELECT 1 FROM knowledge_groups group_row WHERE group_row.id = NEW.group_id AND group_row.project_id = NEW.project_id
      ) OR (
        NEW.parent_entry_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM knowledge_entries parent
          WHERE parent.id = NEW.parent_entry_id AND parent.project_id = NEW.project_id AND parent.group_id = NEW.group_id
        )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Entry group and parent must belong to the same project and group');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_entries_relations_update
      BEFORE UPDATE OF project_id, group_id, parent_entry_id ON knowledge_entries
      WHEN NOT EXISTS (
        SELECT 1 FROM knowledge_groups group_row WHERE group_row.id = NEW.group_id AND group_row.project_id = NEW.project_id
      ) OR (
        NEW.parent_entry_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM knowledge_entries parent
          WHERE parent.id = NEW.parent_entry_id AND parent.project_id = NEW.project_id AND parent.group_id = NEW.group_id
        )
      ) OR (
        NEW.parent_entry_id IS NOT NULL AND EXISTS (
          WITH RECURSIVE descendants(id) AS (
            SELECT OLD.id
            UNION ALL
            SELECT child.id FROM knowledge_entries child JOIN descendants parent ON child.parent_entry_id = parent.id
          )
          SELECT 1 FROM descendants WHERE id = NEW.parent_entry_id
        )
      )
      BEGIN
        SELECT RAISE(ABORT, 'Entry hierarchy cannot cross projects or form a cycle');
      END;
    `)
    ensureColumn(db, 'knowledge_groups', 'parent_group_id', 'TEXT')
    ensureColumn(db, 'knowledge_entries', 'parent_entry_id', 'TEXT')
    ensureColumn(db, 'knowledge_entries', 'icon', 'TEXT')
    ensureColumn(db, 'project_attachments', 'asset_id', 'TEXT')
    if (currentVersion < databaseVersion) db.pragma(`user_version = ${databaseVersion}`)
  })
  migrateTransaction()
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()
  if (columns.some((column) => column.name === columnName)) return
  db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run()
}

function seedLocalWorkspace(db) {
  const existing = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId)
  if (existing) return
  const now = nowIso()
  const insertWorkspace = db.prepare(`
    INSERT INTO workspaces (id, type, deployment, name, description, status, service_url, created_at, updated_at)
    VALUES (@id, @type, @deployment, @name, @description, @status, @serviceUrl, @createdAt, @updatedAt)
  `)

  db.transaction(() => {
    insertWorkspace.run({
      id: workspaceId,
      type: 'local',
      deployment: 'local',
      name: '本地个人库',
      description: '固定在当前电脑上的个人资料库，免登录使用，支持加密备份和恢复。',
      status: '本机 SQLCipher / 路径索引',
      serviceUrl: null,
      createdAt: now,
      updatedAt: now,
    })
  })()
}

const seedProjects = [
  {
    id: 'local-admin',
    name: '本机管理系统资料',
    description: '个人电脑上的项目说明、账号密码、本地文件和快捷入口。',
    tag: '本地项目',
    tone: 'blue',
  },
  {
    id: 'local-notes',
    name: '个人资料库',
    description: '常用脚本、工具链接、临时账号和交接备注。',
    tag: '个人库',
    tone: 'green',
  },
]

function removeSampleProjects(db) {
  const sampleIds = seedProjects.map((project) => project.id)
  const placeholders = sampleIds.map(() => '?').join(',')
  db.prepare(`DELETE FROM projects WHERE id IN (${placeholders})`).run(...sampleIds)
}

function handleRepositoryAction(db, action, payload = {}, fieldSecret) {
  switch (action) {
    case 'listWorkspaces':
      return db.prepare('SELECT * FROM workspaces ORDER BY created_at').all().map(mapWorkspace)
    case 'getWorkspace':
      return optional(db.prepare('SELECT * FROM workspaces WHERE id = ?').get(payload.id), mapWorkspace)
    case 'listProjects':
      return db.prepare('SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC').all(payload.workspaceId).map((row) => mapProject(db, row))
    case 'getProject':
      return optional(db.prepare('SELECT * FROM projects WHERE id = ?').get(payload.id), (row) => mapProject(db, row))
    case 'createProject':
      return createProject(db, payload)
    case 'updateProject':
      return updateProject(db, payload)
    case 'deleteProject':
      return deleteProject(db, payload.id)
    case 'listGroups':
      return listGroups(db, payload.projectId)
    case 'searchEntryIds':
      return searchEntryIds(db, payload.projectId, payload.query, fieldSecret)
    case 'createGroup':
      return createGroup(db, payload)
    case 'updateGroup':
      return updateGroup(db, payload.id, payload.name)
    case 'deleteGroup':
      return deleteGroup(db, payload.id)
    case 'moveEntry':
      return moveEntry(db, payload.entryId, payload.targetGroupId)
    case 'reorderEntry':
      return reorderEntry(db, payload.entryId, payload.direction)
    case 'getEntry':
      return getEntry(db, payload.id, fieldSecret)
    case 'createEntry':
      return createEntry(db, payload, fieldSecret)
    case 'updateEntry':
      return updateEntry(db, payload, fieldSecret)
    case 'deleteEntry':
      return deleteEntry(db, payload.id)
    case 'listAttachments':
      return db.prepare('SELECT * FROM project_attachments WHERE project_id = ? ORDER BY created_at DESC').all(payload.projectId).map(mapAttachment)
    case 'addAttachment':
      return addAttachment(db, payload)
    case 'removeAttachment':
      return removeAttachment(db, payload.id)
    case 'isAssetReferenced':
      return isAssetReferenced(db, payload.id)
    case 'listReferencedAssetIds':
      return listReferencedAssetIds(db)
    case 'getAsset':
      return getAsset(db, payload.id)
    case 'listAssets':
      return listAssets(db)
    case 'upsertAsset':
      return upsertAsset(db, payload)
    case 'markAssetDeleted':
      return markAssetDeleted(db, payload.id)
    case 'enqueueAssetCleanup':
      return enqueueAssetCleanup(db, payload.id)
    case 'listPendingAssetCleanupJobs':
      return listPendingAssetCleanupJobs(db)
    case 'completeAssetCleanup':
      return completeAssetCleanup(db, payload.jobId, payload.assetId)
    case 'failAssetCleanup':
      return failAssetCleanup(db, payload.jobId, payload.error)
    case 'getLocalStorageSettings':
      return getLocalStorageSettings(db)
    case 'setLocalStorageSettings':
      return setLocalStorageSettings(db, payload.basePath)
    case 'listSavedServiceConnections':
      return listSavedServiceConnections(db)
    case 'getSavedServiceConnection':
      return getSavedServiceConnection(db, payload.id)
    case 'saveServiceConnection':
      return saveServiceConnection(db, payload)
    case 'deleteSavedServiceConnection':
      return deleteSavedServiceConnection(db, payload.id)
    case 'listQuickEntries':
      return db.prepare('SELECT * FROM quick_entries WHERE workspace_id = ? ORDER BY sort_order ASC, created_at ASC').all(payload.workspaceId).map(mapQuickEntry)
    case 'createQuickEntry':
      return createQuickEntry(db, payload)
    case 'updateQuickEntry':
      return updateQuickEntry(db, payload)
    case 'deleteQuickEntry':
      return deleteQuickEntry(db, payload.id)
    case 'exportBackup':
      return exportBackup(db, fieldSecret)
    case 'importBackup':
      importBackup(db, payload.payload, fieldSecret)
      return null
    default:
      throw new Error(`Unknown local repository action: ${action}`)
  }
}

function createProject(db, input) {
  const now = nowIso()
  const project = {
    id: `project-${crypto.randomUUID()}`,
    workspaceId: input.workspaceId,
    name: input.name,
    description: input.description,
    tag: input.tag,
    tone: input.tone ?? 'blue',
    createdAt: now,
    updatedAt: now,
  }
  db.prepare(`
    INSERT INTO projects (id, workspace_id, name, description, tag, tone, created_at, updated_at)
    VALUES (@id, @workspaceId, @name, @description, @tag, @tone, @createdAt, @updatedAt)
  `).run(project)
  return mapProject(db, db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id))
}

function deleteProject(db, id) {
  const entryIds = db.prepare('SELECT id FROM knowledge_entries WHERE project_id = ?').all(id).map((row) => row.id)
  const attachmentIds = db.prepare('SELECT id FROM project_attachments WHERE project_id = ?').all(id).map((row) => row.id)
  db.transaction(() => {
    const released = [
      ...deleteAssetReferences(db, 'entry', entryIds),
      ...deleteAssetReferences(db, 'attachment', attachmentIds),
    ]
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    for (const assetId of released) enqueueAssetCleanup(db, assetId)
  })()
  return null
}

function updateProject(db, input) {
  const current = db.prepare('SELECT * FROM projects WHERE id = ?').get(input.id)
  if (!current) return undefined
  db.prepare(`
    UPDATE projects
    SET name = ?, description = ?, tag = ?, tone = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.name ?? current.name,
    input.description ?? current.description,
    input.tag ?? current.tag,
    input.tone ?? current.tone,
    nowIso(),
    input.id,
  )
  return mapProject(db, db.prepare('SELECT * FROM projects WHERE id = ?').get(input.id))
}

function listGroups(db, projectId) {
  const groups = db.prepare('SELECT * FROM knowledge_groups WHERE project_id = ? ORDER BY sort_order, created_at').all(projectId)
  return groups.map((group) => ({
    id: group.id,
    projectId: group.project_id,
    name: group.name,
    parentGroupId: group.parent_group_id ?? undefined,
    entries: db.prepare('SELECT id, title, type, icon, parent_entry_id FROM knowledge_entries WHERE group_id = ? ORDER BY sort_order, created_at').all(group.id).map((entry) => ({
      id: entry.id,
      title: entry.title,
      type: entry.type,
      icon: entry.icon ?? undefined,
      parentEntryId: entry.parent_entry_id ?? undefined,
    })),
  }))
}

function searchEntryIds(db, projectId, query, fieldSecret) {
  const normalized = String(query ?? '').trim().toLocaleLowerCase()
  if (!normalized) return []
  return db.prepare('SELECT id FROM knowledge_entries WHERE project_id = ? ORDER BY updated_at DESC').all(projectId)
    .map((row) => getEntry(db, row.id, fieldSecret))
    .filter(Boolean)
    .filter((entry) => [
      entry.title,
      entry.remark,
      entry.tags.join(' '),
      entry.textContent ?? '',
      entry.linkItems?.map((item) => `${item.name} ${item.target}`).join(' ') ?? '',
      entry.passwordItems?.map((item) => item.name).join(' ') ?? '',
    ].join(' ').toLocaleLowerCase().includes(normalized))
    .map((entry) => entry.id)
}

function createGroup(db, input) {
  if (input.parentGroupId) {
    const parent = db.prepare('SELECT project_id FROM knowledge_groups WHERE id = ?').get(input.parentGroupId)
    if (!parent || parent.project_id !== input.projectId) throw new Error('父分组必须属于同一项目')
  }
  const now = nowIso()
  const sortOrder = nextSortOrder(db, 'knowledge_groups', 'project_id', input.projectId)
  const group = {
    id: `group-${crypto.randomUUID()}`,
    projectId: input.projectId,
    parentGroupId: input.parentGroupId || null,
    name: input.name,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  }
  db.prepare(`
    INSERT INTO knowledge_groups (id, project_id, parent_group_id, name, sort_order, created_at, updated_at)
    VALUES (@id, @projectId, @parentGroupId, @name, @sortOrder, @createdAt, @updatedAt)
  `).run(group)
  touchProject(db, input.projectId)
  return { id: group.id, projectId: group.projectId, parentGroupId: group.parentGroupId ?? undefined, name: group.name, entries: [] }
}

function updateGroup(db, id, name) {
  const group = db.prepare('SELECT * FROM knowledge_groups WHERE id = ?').get(id)
  if (!group) return undefined
  db.prepare('UPDATE knowledge_groups SET name = ?, updated_at = ? WHERE id = ?').run(name, nowIso(), id)
  touchProject(db, group.project_id)
  return listGroups(db, group.project_id).find((item) => item.id === id)
}

function deleteGroup(db, id) {
  const group = db.prepare('SELECT * FROM knowledge_groups WHERE id = ?').get(id)
  if (!group) return null
  const groupIds = collectGroupDescendantIds(db, id)
  const placeholders = groupIds.map(() => '?').join(',')
  const entryIds = placeholders
    ? db.prepare(`SELECT id FROM knowledge_entries WHERE group_id IN (${placeholders})`).all(...groupIds).map((row) => row.id)
    : []
  const deleteGroups = db.transaction(() => {
    const released = deleteAssetReferences(db, 'entry', entryIds)
    for (const groupId of groupIds) db.prepare('DELETE FROM knowledge_groups WHERE id = ?').run(groupId)
    for (const assetId of released) enqueueAssetCleanup(db, assetId)
  })
  deleteGroups()
  touchProject(db, group.project_id)
  return null
}

function collectGroupDescendantIds(db, rootGroupId) {
  const childrenByParent = new Map()
  const groups = db.prepare('SELECT id, parent_group_id FROM knowledge_groups').all()
  for (const group of groups) {
    const parentId = group.parent_group_id ?? ''
    const children = childrenByParent.get(parentId) ?? []
    children.push(group.id)
    childrenByParent.set(parentId, children)
  }

  const result = []
  const visit = (groupId) => {
    result.push(groupId)
    for (const childId of childrenByParent.get(groupId) ?? []) visit(childId)
  }
  visit(rootGroupId)
  return result
}

function moveEntry(db, entryId, targetGroupId) {
  const entry = db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(entryId)
  const targetGroup = db.prepare('SELECT * FROM knowledge_groups WHERE id = ?').get(targetGroupId)
  if (!entry || !targetGroup || entry.group_id === targetGroupId) return null
  if (entry.project_id !== targetGroup.project_id) throw new Error('目标分组必须属于条目所在项目')
  const sortOrder = nextSortOrder(db, 'knowledge_entries', 'group_id', targetGroupId)
  db.prepare('UPDATE knowledge_entries SET group_id = ?, parent_entry_id = NULL, sort_order = ?, updated_at = ? WHERE id = ?').run(targetGroupId, sortOrder, nowIso(), entryId)
  touchProject(db, targetGroup.project_id)
  return null
}

function reorderEntry(db, entryId, direction) {
  const entry = db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(entryId)
  if (!entry) return null
  const entries = db.prepare('SELECT id, sort_order FROM knowledge_entries WHERE group_id = ? ORDER BY sort_order, created_at').all(entry.group_id)
  const index = entries.findIndex((item) => item.id === entryId)
  const nextIndex = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || nextIndex < 0 || nextIndex >= entries.length) return null
  db.transaction(() => {
    db.prepare('UPDATE knowledge_entries SET sort_order = ? WHERE id = ?').run(entries[nextIndex].sort_order, entries[index].id)
    db.prepare('UPDATE knowledge_entries SET sort_order = ? WHERE id = ?').run(entries[index].sort_order, entries[nextIndex].id)
  })()
  touchProject(db, entry.project_id)
  return null
}

function createEntry(db, input, fieldSecret) {
  assertEntryRelation(db, input.projectId, input.groupId, input.parentEntryId)
  const now = nowIso()
  const entry = {
    id: `entry-${crypto.randomUUID()}`,
    projectId: input.projectId,
    groupId: input.groupId,
    parentEntryId: input.parentEntryId || null,
    type: input.type,
    title: input.title,
    icon: input.icon ?? null,
    remark: input.remark ?? '',
    tags: [],
    sortOrder: nextSortOrder(db, 'knowledge_entries', 'group_id', input.groupId),
    createdAt: now,
    updatedAt: now,
    textContent: input.type === 'text' ? '' : undefined,
    passwordItems: input.type === 'password' ? [] : undefined,
    linkItems: input.type === 'link' ? [] : undefined,
  }
  insertEntry(db, entry, fieldSecret)
  touchProject(db, input.projectId)
  return getEntry(db, entry.id, fieldSecret)
}

function insertEntry(db, entry, fieldSecret) {
  const normalizedEntry = {
    ...entry,
    parentEntryId: entry.parentEntryId ?? null,
    icon: entry.icon ?? null,
    remark: entry.remark ?? '',
    tagsJson: JSON.stringify(entry.tags ?? []),
  }
  db.prepare(`
    INSERT INTO knowledge_entries (id, project_id, group_id, parent_entry_id, type, title, icon, remark, tags_json, sort_order, created_at, updated_at)
    VALUES (@id, @projectId, @groupId, @parentEntryId, @type, @title, @icon, @remark, @tagsJson, @sortOrder, @createdAt, @updatedAt)
  `).run(normalizedEntry)

  if (entry.type === 'text') {
    db.prepare('INSERT INTO text_entry_contents (entry_id, content_format, content) VALUES (?, ?, ?)').run(entry.id, 'tiptap-json', entry.textContent ?? '')
  }
  if (entry.type === 'password') {
    insertPasswordItems(db, entry.id, entry.passwordItems ?? [], entry.createdAt, fieldSecret)
  }
  if (entry.type === 'link') {
    insertLinkItems(db, entry.id, entry.linkItems ?? [])
  }
  refreshAssetReferences(db, 'entry', entry.id, [entry.textContent])
}

function updateEntry(db, input, fieldSecret) {
  const current = db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(input.id)
  if (!current) return undefined
  const nextParentEntryId = input.parentEntryId === undefined ? current.parent_entry_id : input.parentEntryId
  assertEntryRelation(db, current.project_id, current.group_id, nextParentEntryId, input.id)
  const now = nowIso()
  db.transaction(() => {
    const previousAssetIds = db.prepare("SELECT asset_id FROM asset_references WHERE owner_type = 'entry' AND owner_id = ?").all(input.id).map((row) => row.asset_id)
    db.prepare(`
      UPDATE knowledge_entries
      SET title = ?, parent_entry_id = ?, icon = ?, remark = ?, tags_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.title ?? current.title,
      input.parentEntryId === undefined ? current.parent_entry_id : input.parentEntryId || null,
      input.icon === undefined ? current.icon : input.icon,
      input.remark ?? current.remark,
      JSON.stringify(input.tags ?? parseJson(current.tags_json, [])),
      now,
      input.id,
    )
    if (current.type === 'text' && typeof input.textContent === 'string') {
      db.prepare('UPDATE text_entry_contents SET content = ? WHERE entry_id = ?').run(input.textContent, input.id)
      refreshAssetReferences(db, 'entry', input.id, [input.textContent])
      for (const assetId of previousAssetIds) enqueueAssetCleanup(db, assetId)
    }
    if (current.type === 'password' && input.passwordItems) {
      db.prepare('DELETE FROM password_entry_items WHERE entry_id = ?').run(input.id)
      insertPasswordItems(db, input.id, input.passwordItems, now, fieldSecret)
    }
    if (current.type === 'link' && input.linkItems) {
      db.prepare('DELETE FROM link_entry_items WHERE entry_id = ?').run(input.id)
      insertLinkItems(db, input.id, input.linkItems)
    }
  })()
  touchProject(db, current.project_id)
  return getEntry(db, input.id, fieldSecret)
}

function assertEntryRelation(db, projectId, groupId, parentEntryId, entryId) {
  const group = db.prepare('SELECT project_id FROM knowledge_groups WHERE id = ?').get(groupId)
  if (!group || group.project_id !== projectId) throw new Error('条目分组必须属于同一项目')
  if (!parentEntryId) return
  const parent = db.prepare('SELECT project_id, group_id FROM knowledge_entries WHERE id = ?').get(parentEntryId)
  if (!parent || parent.project_id !== projectId || parent.group_id !== groupId) throw new Error('父条目必须属于同一项目和分组')
  if (!entryId) return
  const cycle = db.prepare(`
    WITH RECURSIVE descendants(id) AS (
      SELECT ?
      UNION ALL
      SELECT child.id FROM knowledge_entries child JOIN descendants parent ON child.parent_entry_id = parent.id
    )
    SELECT 1 AS found FROM descendants WHERE id = ? LIMIT 1
  `).get(entryId, parentEntryId)
  if (cycle) throw new Error('条目层级不能形成循环')
}

function deleteEntry(db, id) {
  const entry = db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(id)
  if (!entry) return null
  const entryIds = collectEntryDescendantIds(db, id)
  const deleteEntries = db.transaction(() => {
    const released = deleteAssetReferences(db, 'entry', entryIds)
    for (const entryId of entryIds) db.prepare('DELETE FROM knowledge_entries WHERE id = ?').run(entryId)
    for (const assetId of released) enqueueAssetCleanup(db, assetId)
  })
  deleteEntries()
  touchProject(db, entry.project_id)
  return null
}

function collectEntryDescendantIds(db, rootEntryId) {
  const childrenByParent = new Map()
  const entries = db.prepare('SELECT id, parent_entry_id FROM knowledge_entries').all()
  for (const entry of entries) {
    const parentId = entry.parent_entry_id ?? ''
    const children = childrenByParent.get(parentId) ?? []
    children.push(entry.id)
    childrenByParent.set(parentId, children)
  }

  const result = []
  const visit = (entryId) => {
    result.push(entryId)
    for (const childId of childrenByParent.get(entryId) ?? []) visit(childId)
  }
  visit(rootEntryId)
  return result
}

function getEntry(db, id, fieldSecret) {
  const entry = db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(id)
  if (!entry) return undefined
  const detail = {
    id: entry.id,
    projectId: entry.project_id,
    parentEntryId: entry.parent_entry_id ?? undefined,
    title: entry.title,
    icon: entry.icon ?? undefined,
    type: entry.type,
    remark: entry.remark,
    tags: parseJson(entry.tags_json, []),
    createdAt: formatDateTime(new Date(entry.created_at)),
    updatedAt: formatDateTime(new Date(entry.updated_at)),
  }
  if (entry.type === 'text') {
    detail.textContent = db.prepare('SELECT content FROM text_entry_contents WHERE entry_id = ?').get(id)?.content ?? ''
  }
  if (entry.type === 'password') {
    detail.passwordItems = db.prepare('SELECT id, name, value_preview FROM password_entry_items WHERE entry_id = ? ORDER BY sort_order').all(id).map((item) => ({
      id: item.id,
      name: item.name,
      valuePreview: decryptSensitiveField(item.value_preview, fieldSecret),
    }))
  }
  if (entry.type === 'link') {
    detail.linkItems = db.prepare('SELECT id, name, target_type, target FROM link_entry_items WHERE entry_id = ? ORDER BY sort_order').all(id).map((item) => ({
      id: item.id,
      name: item.name,
      targetType: item.target_type,
      target: item.target,
    }))
  }
  return detail
}

function insertPasswordItems(db, entryId, items, timestamp, fieldSecret) {
  const stmt = db.prepare(`
    INSERT INTO password_entry_items (id, entry_id, name, value_preview, sort_order, created_at, updated_at)
    VALUES (@id, @entryId, @name, @valuePreview, @sortOrder, @createdAt, @updatedAt)
  `)
  items.forEach((item, index) => {
    stmt.run({
      id: item.id || `password-${crypto.randomUUID()}`,
      entryId,
      name: item.name,
      valuePreview: encryptSensitiveField(item.valuePreview, fieldSecret),
      sortOrder: index,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  })
}

function insertLinkItems(db, entryId, items) {
  const stmt = db.prepare(`
    INSERT INTO link_entry_items (id, entry_id, name, target_type, target, sort_order)
    VALUES (@id, @entryId, @name, @targetType, @target, @sortOrder)
  `)
  items.forEach((item, index) => {
    stmt.run({
      id: item.id || `link-${crypto.randomUUID()}`,
      entryId,
      name: item.name,
      targetType: item.targetType,
      target: item.target,
      sortOrder: index,
    })
  })
}

function migrateSensitiveFields(db, fieldSecret) {
  const rows = db.prepare('SELECT id, value_preview FROM password_entry_items').all()
  const update = db.prepare('UPDATE password_entry_items SET value_preview = ? WHERE id = ?')
  const migrateTransaction = db.transaction(() => {
    for (const row of rows) {
      if (typeof row.value_preview !== 'string' || row.value_preview.startsWith(fieldEncryptedPrefix)) continue
      update.run(encryptSensitiveField(row.value_preview, fieldSecret), row.id)
    }
  })
  migrateTransaction()
}

function encryptSensitiveField(value, fieldSecret) {
  if (typeof value !== 'string' || value.startsWith(fieldEncryptedPrefix)) return value
  const iv = crypto.randomBytes(12)
  const key = deriveFieldKey(fieldSecret)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${fieldEncryptedPrefix}${JSON.stringify({
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  })}`
}

function decryptSensitiveField(value, fieldSecret) {
  if (typeof value !== 'string' || !value.startsWith(fieldEncryptedPrefix)) return value
  try {
    const envelope = JSON.parse(value.slice(fieldEncryptedPrefix.length))
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveFieldKey(fieldSecret), Buffer.from(envelope.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}

function deriveFieldKey(fieldSecret) {
  return crypto.createHash('sha256').update(`deek-field-key:${fieldSecret}`).digest()
}

function addAttachment(db, input) {
  const attachment = {
    id: `attachment-${crypto.randomUUID()}`,
    projectId: input.projectId,
    name: input.name,
    targetType: input.targetType,
    target: input.target,
    assetId: input.assetId ?? null,
    createdAt: nowIso(),
  }
  db.prepare(`
    INSERT INTO project_attachments (id, project_id, name, target_type, target, asset_id, created_at)
    VALUES (@id, @projectId, @name, @targetType, @target, @assetId, @createdAt)
  `).run(attachment)
  refreshAssetReferences(db, 'attachment', attachment.id, [attachment.assetId, attachment.target])
  touchProject(db, input.projectId)
  return mapAttachmentRow(attachment)
}

function removeAttachment(db, id) {
  const attachment = db.prepare('SELECT * FROM project_attachments WHERE id = ?').get(id)
  if (!attachment) return null
  db.transaction(() => {
    const released = deleteAssetReferences(db, 'attachment', [id])
    db.prepare('DELETE FROM project_attachments WHERE id = ?').run(id)
    for (const assetId of released) enqueueAssetCleanup(db, assetId)
  })()
  touchProject(db, attachment.project_id)
  return null
}

function isAssetReferenced(db, assetId) {
  if (typeof assetId !== 'string' || !/^local-[a-f0-9]{64}$/i.test(assetId)) return false
  const sha256 = assetId.slice('local-'.length)
  const explicitCount = db.prepare('SELECT COUNT(*) AS count FROM asset_references WHERE asset_id = ?').get(assetId).count
  if (explicitCount > 0) return true
  const attachmentCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM project_attachments
    WHERE asset_id = ? OR target LIKE ?
  `).get(assetId, `%${sha256}%`).count
  if (attachmentCount > 0) return true
  return db.prepare('SELECT COUNT(*) AS count FROM text_entry_contents WHERE content LIKE ?').get(`%${sha256}%`).count > 0
}

function listReferencedAssetIds(db) {
  const result = new Set()
  const pattern = /local-[a-f0-9]{64}/gi
  const values = [
    ...db.prepare('SELECT asset_id AS value FROM asset_references').all(),
    ...db.prepare('SELECT asset_id AS value FROM project_attachments WHERE asset_id IS NOT NULL').all(),
    ...db.prepare('SELECT target AS value FROM project_attachments WHERE target LIKE ?').all('%deek-asset://managed-assets/%'),
    ...db.prepare('SELECT content AS value FROM text_entry_contents WHERE content LIKE ?').all('%deek-asset://managed-assets/%'),
  ]
  for (const row of values) {
    for (const match of String(row.value ?? '').matchAll(pattern)) result.add(match[0].toLowerCase())
    const urlPattern = /deek-asset:\/\/managed-assets\/[a-f0-9]{2}\/([a-f0-9]{64})(?:[./"'?#]|$)/gi
    for (const match of String(row.value ?? '').matchAll(urlPattern)) result.add(`local-${match[1].toLowerCase()}`)
  }
  return [...result]
}

function assetIdsInValues(values) {
  const result = new Set()
  const idPattern = /local-[a-f0-9]{64}/gi
  const urlPattern = /deek-asset:\/\/managed-assets\/[a-f0-9]{2}\/([a-f0-9]{64})(?:[./"'?#]|$)/gi
  for (const value of values) {
    const text = String(value ?? '')
    for (const match of text.matchAll(idPattern)) result.add(match[0].toLowerCase())
    for (const match of text.matchAll(urlPattern)) result.add(`local-${match[1].toLowerCase()}`)
  }
  return [...result]
}

function refreshAssetReferences(db, ownerType, ownerId, values) {
  db.prepare('DELETE FROM asset_references WHERE owner_type = ? AND owner_id = ?').run(ownerType, ownerId)
  const insert = db.prepare(`
    INSERT OR IGNORE INTO asset_references (id, asset_id, owner_type, owner_id, created_at)
    SELECT ?, id, ?, ?, ? FROM assets WHERE id = ? AND status <> 'deleted'
  `)
  for (const assetId of assetIdsInValues(values)) {
    const referenceId = `asset-ref-${crypto.createHash('sha256').update(`${ownerType}:${ownerId}:${assetId}`).digest('hex')}`
    insert.run(referenceId, ownerType, ownerId, nowIso(), assetId)
  }
}

function deleteAssetReferences(db, ownerType, ownerIds) {
  if (ownerIds.length === 0) return []
  const placeholders = ownerIds.map(() => '?').join(',')
  const released = db.prepare(`SELECT DISTINCT asset_id FROM asset_references WHERE owner_type = ? AND owner_id IN (${placeholders})`).all(ownerType, ...ownerIds).map((row) => row.asset_id)
  db.prepare(`DELETE FROM asset_references WHERE owner_type = ? AND owner_id IN (${placeholders})`).run(ownerType, ...ownerIds)
  return released
}

function mapAssetRecord(row) {
  if (!row) return undefined
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    objectKey: row.object_key,
    status: row.status,
    storedUrl: `deek-asset://managed-assets/${row.object_key}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function getAsset(db, id) {
  return mapAssetRecord(db.prepare('SELECT * FROM assets WHERE id = ?').get(id))
}

function listAssets(db) {
  return db.prepare("SELECT * FROM assets WHERE workspace_id = ? AND status <> 'deleted' ORDER BY created_at").all(workspaceId).map(mapAssetRecord)
}

function upsertAsset(db, input) {
  if (!input || typeof input.id !== 'string' || !/^local-[a-f0-9]{64}$/i.test(input.id)) throw new Error('Invalid local asset id')
  if (typeof input.sha256 !== 'string' || input.id.toLowerCase() !== `local-${input.sha256.toLowerCase()}`) throw new Error('Local asset id must match SHA-256')
  const now = nowIso()
  const record = {
    id: input.id.toLowerCase(),
    workspaceId,
    kind: input.kind === 'attachment' ? 'attachment' : 'image',
    originalName: String(input.originalName || 'asset.bin'),
    mimeType: String(input.mimeType || 'application/octet-stream'),
    sizeBytes: Number(input.sizeBytes) || 0,
    sha256: input.sha256.toLowerCase(),
    objectKey: String(input.objectKey || ''),
    status: input.status === 'pending' ? 'pending' : 'ready',
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : now,
    updatedAt: now,
  }
  if (!record.objectKey) throw new Error('Local asset object key is required')
  db.prepare(`
    INSERT INTO assets (id, workspace_id, kind, original_name, mime_type, size_bytes, sha256, object_key, status, created_at, updated_at)
    VALUES (@id, @workspaceId, @kind, @originalName, @mimeType, @sizeBytes, @sha256, @objectKey, @status, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      original_name = excluded.original_name,
      mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes,
      object_key = excluded.object_key,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(record)
  db.prepare("UPDATE asset_cleanup_jobs SET status = 'done', updated_at = ? WHERE asset_id = ? AND status <> 'done'").run(now, record.id)
  for (const row of db.prepare('SELECT id, asset_id, target FROM project_attachments WHERE asset_id = ? OR target LIKE ?').all(record.id, `%${record.sha256}%`)) {
    refreshAssetReferences(db, 'attachment', row.id, [row.asset_id, row.target])
  }
  for (const row of db.prepare('SELECT entry_id, content FROM text_entry_contents WHERE content LIKE ?').all(`%${record.sha256}%`)) {
    refreshAssetReferences(db, 'entry', row.entry_id, [row.content])
  }
  return getAsset(db, record.id)
}

function markAssetDeleted(db, id) {
  db.prepare("UPDATE assets SET status = 'deleted', updated_at = ? WHERE id = ?").run(nowIso(), id)
  return null
}

function enqueueAssetCleanup(db, assetId) {
  const asset = db.prepare("SELECT * FROM assets WHERE id = ? AND status NOT IN ('deleted', 'deleting')").get(assetId)
  if (!asset) return null
  const referenced = db.prepare('SELECT EXISTS(SELECT 1 FROM asset_references WHERE asset_id = ?) AS value').get(assetId).value
  if (referenced) return null
  const now = nowIso()
  const job = { id: `asset-cleanup-${crypto.randomUUID()}`, assetId, objectKey: asset.object_key, createdAt: now, updatedAt: now }
  db.transaction(() => {
    db.prepare("UPDATE assets SET status = 'deleting', updated_at = ? WHERE id = ?").run(now, assetId)
    db.prepare(`
      INSERT INTO asset_cleanup_jobs (id, asset_id, object_key, status, attempts, created_at, updated_at)
      VALUES (@id, @assetId, @objectKey, 'pending', 0, @createdAt, @updatedAt)
    `).run(job)
  })()
  return job
}

function listPendingAssetCleanupJobs(db) {
  return db.prepare(`
    SELECT id, asset_id AS assetId, object_key AS objectKey, attempts
    FROM asset_cleanup_jobs WHERE status IN ('pending', 'failed') ORDER BY updated_at LIMIT 100
  `).all()
}

function completeAssetCleanup(db, jobId, assetId) {
  const now = nowIso()
  db.transaction(() => {
    db.prepare("UPDATE asset_cleanup_jobs SET status = 'done', updated_at = ? WHERE id = ?").run(now, jobId)
    db.prepare("UPDATE assets SET status = 'deleted', updated_at = ? WHERE id = ?").run(now, assetId)
  })()
  return null
}

function failAssetCleanup(db, jobId, error) {
  db.prepare(`
    UPDATE asset_cleanup_jobs
    SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ?
    WHERE id = ?
  `).run(String(error || 'Unknown cleanup error').slice(0, 2000), nowIso(), jobId)
  return null
}

function getLocalStorageSettings(db) {
  const modern = getAssetStorageSettings(db, null, false)
  if (modern.driver === 's3') return modern
  const row = db.prepare("SELECT value, updated_at FROM local_settings WHERE key = 'managed_assets_base_path'").get()
  if (!row) return { driver: 'filesystem', configured: false }
  return { driver: 'filesystem', configured: true, basePath: row.value, updatedAt: row.updated_at }
}

function setLocalStorageSettings(db, basePath) {
  if (basePath === null || basePath === undefined || basePath === '') {
    db.prepare("DELETE FROM local_settings WHERE key = 'managed_assets_base_path'").run()
    return { driver: 'filesystem', configured: false }
  }
  if (typeof basePath !== 'string') throw new Error('Invalid local storage base path')
  const updatedAt = nowIso()
  db.prepare(`
    INSERT INTO local_settings (key, value, updated_at)
    VALUES ('managed_assets_base_path', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(basePath, updatedAt)
  return { driver: 'filesystem', configured: true, basePath, updatedAt }
}

function getAssetStorageSettings(db, fieldSecret, includeCredentials) {
  const row = db.prepare("SELECT value, updated_at FROM local_settings WHERE key = 'asset_storage_v2'").get()
  if (!row) {
    const legacy = db.prepare("SELECT value, updated_at FROM local_settings WHERE key = 'managed_assets_base_path'").get()
    return {
      driver: 'filesystem',
      configured: Boolean(legacy),
      basePath: legacy?.value ?? null,
      updatedAt: legacy?.updated_at,
    }
  }
  const parsed = parseJson(row.value, null)
  if (!parsed || !['filesystem', 's3'].includes(parsed.driver)) throw new Error('Invalid local asset storage settings')
  if (parsed.driver === 'filesystem') {
    return { driver: 'filesystem', configured: Boolean(parsed.basePath), basePath: parsed.basePath ?? null, updatedAt: row.updated_at }
  }
  const result = {
    driver: 's3',
    configured: true,
    endpoint: parsed.endpoint,
    region: parsed.region,
    bucket: parsed.bucket,
    forcePathStyle: parsed.forcePathStyle !== false,
    hasCredentials: Boolean(parsed.credentialsEncrypted),
    updatedAt: row.updated_at,
  }
  if (!includeCredentials) return result
  if (!fieldSecret) throw new Error('Local database is locked')
  const credentials = parseJson(decryptSensitiveField(parsed.credentialsEncrypted, fieldSecret), null)
  if (!credentials?.accessKey || !credentials?.secretKey) throw new Error('S3 credentials are unavailable')
  return { ...result, credentials }
}

function setAssetStorageSettings(db, input, fieldSecret) {
  if (!input || !['filesystem', 's3'].includes(input.driver)) throw new Error('Invalid local asset storage settings')
  const now = nowIso()
  let stored
  if (input.driver === 'filesystem') {
    stored = { driver: 'filesystem', basePath: typeof input.basePath === 'string' && input.basePath.trim() ? input.basePath.trim() : null }
  } else {
    if (!fieldSecret) throw new Error('Local database is locked')
    const suppliedCredentials = input.credentials?.accessKey && input.credentials?.secretKey ? input.credentials : null
    const current = suppliedCredentials ? null : getAssetStorageSettings(db, fieldSecret, true)
    const credentials = suppliedCredentials ?? (current?.driver === 's3' ? current.credentials : null)
    if (!credentials) throw new Error('S3 credentials are required')
    stored = {
      driver: 's3',
      endpoint: String(input.endpoint || '').replace(/\/$/, ''),
      region: String(input.region || 'us-east-1'),
      bucket: String(input.bucket || ''),
      forcePathStyle: input.forcePathStyle !== false,
      credentialsEncrypted: encryptSensitiveField(JSON.stringify(credentials), fieldSecret),
    }
    if (!/^https?:\/\//i.test(stored.endpoint) || !stored.bucket) throw new Error('Invalid S3 endpoint or bucket')
  }
  db.prepare(`
    INSERT INTO local_settings (key, value, updated_at) VALUES ('asset_storage_v2', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(JSON.stringify(stored), now)
  if (stored.driver === 'filesystem') {
    if (stored.basePath) setLocalStorageSettings(db, stored.basePath)
    else setLocalStorageSettings(db, null)
  }
  return getAssetStorageSettings(db, fieldSecret, false)
}

function listSavedServiceConnections(db) {
  return db.prepare(`
    SELECT id, base_url AS baseUrl, deployment, account_email AS accountEmail,
           instance_name AS instanceName, encrypted_access_token IS NOT NULL AS hasSavedSession,
           created_at AS createdAt, updated_at AS updatedAt
    FROM saved_service_connections ORDER BY updated_at DESC
  `).all().map((row) => ({ ...row, hasSavedSession: Boolean(row.hasSavedSession) }))
}

function getSavedServiceConnection(db, id) {
  return db.prepare(`
    SELECT id, base_url AS baseUrl, deployment, account_email AS accountEmail,
           instance_name AS instanceName, encrypted_access_token AS encryptedAccessToken,
           created_at AS createdAt, updated_at AS updatedAt
    FROM saved_service_connections WHERE id = ?
  `).get(id)
}

function saveServiceConnection(db, input) {
  if (!input || typeof input.baseUrl !== 'string' || typeof input.accountEmail !== 'string') throw new Error('Invalid service connection')
  const current = db.prepare('SELECT id, created_at FROM saved_service_connections WHERE base_url = ? AND account_email = ?').get(input.baseUrl, input.accountEmail)
  const now = nowIso()
  const connection = {
    id: current?.id ?? `service-${crypto.randomUUID()}`,
    baseUrl: input.baseUrl,
    deployment: input.deployment === 'cloud' ? 'cloud' : 'selfhost',
    accountEmail: input.accountEmail,
    instanceName: typeof input.instanceName === 'string' && input.instanceName.trim() ? input.instanceName.trim() : input.baseUrl,
    encryptedAccessToken: typeof input.encryptedAccessToken === 'string' ? input.encryptedAccessToken : null,
    createdAt: current?.created_at ?? now,
    updatedAt: now,
  }
  db.prepare(`
    INSERT INTO saved_service_connections (
      id, base_url, deployment, account_email, instance_name, encrypted_access_token, created_at, updated_at
    ) VALUES (@id, @baseUrl, @deployment, @accountEmail, @instanceName, @encryptedAccessToken, @createdAt, @updatedAt)
    ON CONFLICT(base_url, account_email) DO UPDATE SET
      deployment = excluded.deployment,
      instance_name = excluded.instance_name,
      encrypted_access_token = excluded.encrypted_access_token,
      updated_at = excluded.updated_at
  `).run(connection)
  return getSavedServiceConnection(db, connection.id)
}

function deleteSavedServiceConnection(db, id) {
  db.prepare('DELETE FROM saved_service_connections WHERE id = ?').run(id)
  return null
}

function createQuickEntry(db, input) {
  const now = nowIso()
  const quickEntry = {
    id: `quick-entry-${crypto.randomUUID()}`,
    workspaceId: input.workspaceId,
    name: input.name,
    targetType: input.targetType,
    target: input.target,
    published: input.published ? 1 : 0,
    sortOrder: nextSortOrder(db, 'quick_entries', 'workspace_id', input.workspaceId),
    createdAt: now,
    updatedAt: now,
  }
  db.prepare(`
    INSERT INTO quick_entries (id, workspace_id, name, target_type, target, published, sort_order, created_at, updated_at)
    VALUES (@id, @workspaceId, @name, @targetType, @target, @published, @sortOrder, @createdAt, @updatedAt)
  `).run(quickEntry)
  return mapQuickEntry(db.prepare('SELECT * FROM quick_entries WHERE id = ?').get(quickEntry.id))
}

function updateQuickEntry(db, input) {
  const current = db.prepare('SELECT * FROM quick_entries WHERE id = ?').get(input.id)
  if (!current) return undefined
  db.prepare(`
    UPDATE quick_entries
    SET name = ?, target_type = ?, target = ?, published = ?, sort_order = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.name ?? current.name,
    input.targetType ?? current.target_type,
    input.target ?? current.target,
    input.published === undefined ? current.published : input.published ? 1 : 0,
    input.sortOrder ?? current.sort_order,
    nowIso(),
    input.id,
  )
  return mapQuickEntry(db.prepare('SELECT * FROM quick_entries WHERE id = ?').get(input.id))
}

function deleteQuickEntry(db, id) {
  db.prepare('DELETE FROM quick_entries WHERE id = ?').run(id)
  return null
}

function exportBackup(db, fieldSecret) {
  const workspaces = db.prepare('SELECT * FROM workspaces WHERE id = ?').all(workspaceId).map(mapWorkspace)
  const projects = db.prepare('SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId).map((row) => mapProject(db, row))
  const projectIds = projects.map((project) => project.id)
  return {
    version: 1,
    exportedAt: formatDateTime(new Date()),
    workspaces,
    projects,
    knowledgeGroups: projectIds.flatMap((projectId) => listGroups(db, projectId)),
    entries: Object.fromEntries(
      db.prepare(`SELECT id FROM knowledge_entries WHERE project_id IN (${projectIds.map(() => '?').join(',') || "''"})`).all(...projectIds).map((row) => [row.id, getEntry(db, row.id, fieldSecret)]),
    ),
    attachments: projectIds.flatMap((projectId) => db.prepare('SELECT * FROM project_attachments WHERE project_id = ?').all(projectId).map(mapAttachment)),
    quickEntries: db.prepare('SELECT * FROM quick_entries WHERE workspace_id = ? ORDER BY sort_order ASC, created_at ASC').all(workspaceId).map(mapQuickEntry),
    managedAssetRecords: listAssets(db),
  }
}

function importBackup(db, payload, fieldSecret) {
  if (!payload || payload.version !== 1) throw new Error('不支持的备份格式')
  db.transaction(() => {
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId)
    const localWorkspace = payload.workspaces.find((workspace) => workspace.id === workspaceId) ?? {
      id: workspaceId,
      type: 'local',
      deployment: 'local',
      name: '本地个人库',
      description: '从备份恢复的本地个人库。',
      status: '本机 SQLCipher / 路径索引',
    }
    const now = nowIso()
    db.prepare(`
      INSERT INTO workspaces (id, type, deployment, name, description, status, service_url, created_at, updated_at)
      VALUES (@id, @type, @deployment, @name, @description, @status, @serviceUrl, @createdAt, @updatedAt)
    `).run({ ...localWorkspace, serviceUrl: localWorkspace.serviceUrl ?? null, createdAt: now, updatedAt: now })
    for (const asset of payload.managedAssetRecords ?? []) {
      upsertAsset(db, {
        ...asset,
        sha256: asset.sha256 ?? String(asset.id).replace(/^local-/, ''),
        objectKey: asset.objectKey ?? String(asset.storedUrl ?? '').replace('deek-asset://managed-assets/', ''),
      })
    }
    for (const project of payload.projects.filter((item) => item.workspaceId === workspaceId)) {
      db.prepare(`
        INSERT INTO projects (id, workspace_id, name, description, tag, tone, created_at, updated_at)
        VALUES (@id, @workspaceId, @name, @description, @tag, @tone, @createdAt, @updatedAt)
      `).run({ ...project, createdAt: now, updatedAt: now })
    }
    for (const [index, group] of payload.knowledgeGroups.entries()) {
      db.prepare(`
        INSERT INTO knowledge_groups (id, project_id, parent_group_id, name, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(group.id, group.projectId, group.parentGroupId ?? null, group.name, index, now, now)
    }
    for (const group of payload.knowledgeGroups) {
      group.entries.forEach((summary, index) => {
        const detail = payload.entries[summary.id]
        if (detail) insertEntry(db, { ...detail, groupId: group.id, sortOrder: index, createdAt: now, updatedAt: now }, fieldSecret)
      })
    }
    for (const attachment of payload.attachments ?? []) {
      db.prepare(`
        INSERT INTO project_attachments (id, project_id, name, target_type, target, asset_id, created_at)
        VALUES (@id, @projectId, @name, @targetType, @target, @assetId, @createdAt)
      `).run({ ...attachment, assetId: attachment.assetId ?? null, createdAt: now })
      refreshAssetReferences(db, 'attachment', attachment.id, [attachment.assetId, attachment.target])
    }
    for (const [index, quickEntry] of (payload.quickEntries ?? []).filter((item) => item.workspaceId === workspaceId).entries()) {
      db.prepare(`
        INSERT INTO quick_entries (id, workspace_id, name, target_type, target, published, sort_order, created_at, updated_at)
        VALUES (@id, @workspaceId, @name, @targetType, @target, @published, @sortOrder, @createdAt, @updatedAt)
      `).run({
        ...quickEntry,
        published: quickEntry.published ? 1 : 0,
        sortOrder: quickEntry.sortOrder ?? index,
        createdAt: now,
        updatedAt: now,
      })
    }
  })()
}

function mapWorkspace(row) {
  return {
    id: row.id,
    type: row.type,
    deployment: row.deployment,
    name: row.name,
    description: row.description,
    status: row.status,
    serviceUrl: row.service_url ?? undefined,
  }
}

function mapProject(db, row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    tag: row.tag,
    entryCount: db.prepare('SELECT COUNT(*) AS count FROM knowledge_entries WHERE project_id = ?').get(row.id).count,
    updatedAtText: formatRelative(row.updated_at),
    tone: row.tone,
  }
}

function mapAttachment(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    targetType: row.target_type,
    target: row.target,
    assetId: row.asset_id ?? undefined,
    createdAt: formatDateTime(new Date(row.created_at)),
  }
}

function mapAttachmentRow(row) {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    targetType: row.targetType,
    target: row.target,
    createdAt: formatDateTime(new Date(row.createdAt)),
  }
}

function mapQuickEntry(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    targetType: row.target_type,
    target: row.target,
    published: Boolean(row.published),
    sortOrder: row.sort_order,
    createdAt: formatDateTime(new Date(row.created_at)),
    updatedAt: formatDateTime(new Date(row.updated_at)),
  }
}

function touchProject(db, projectId) {
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(nowIso(), projectId)
}

function nextSortOrder(db, table, foreignKey, foreignValue) {
  return (db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM ${table} WHERE ${foreignKey} = ?`).get(foreignValue)?.next ?? 0)
}

function nowIso() {
  return new Date().toISOString()
}

function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatRelative(value) {
  const date = new Date(value)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 60 * 1000) return '刚刚'
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) return `今天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return formatDateTime(date)
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function optional(row, mapper) {
  return row ? mapper(row) : undefined
}

function escapePragmaValue(value) {
  return String(value).replace(/'/g, "''")
}

async function removeIfExists(filePath) {
  try {
    await fsp.unlink(filePath)
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error
  }
}

module.exports = { createLocalDatabaseService }
