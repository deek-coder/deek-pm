const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage, Menu, protocol, net } = require('electron')
const fs = require('node:fs/promises')
const { Readable } = require('node:stream')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const crypto = require('node:crypto')
const { createLocalDatabaseService } = require('./local-database.cjs')
const { createAssetStorage, migrateAssetRecords } = require('./asset-storage.cjs')
const { migrateLegacyInlineImages } = require('./legacy-asset-migration.cjs')
const {
  copyManagedAssetsVerified,
  exportManagedAssetsForBackup,
  hashFile,
  listManagedAssetFiles,
  restoreManagedAssetsMerged,
} = require('./local-asset-files.cjs')
const {
  createEncryptedBackupEnvelope,
  decryptEncryptedBackupEnvelope,
  isEncryptedBackupEnvelope,
} = require('./backup-crypto.cjs')
const { autoUpdater } = require('electron-updater')
const { createAutoUpdateService } = require('./auto-updater.cjs')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const localStoreFileName = 'deek-local-store.json'
const customManagedAssetsDirectoryName = 'deek-pm-assets'
let localDatabaseService = null
let managedAssetsMigrationInProgress = false
let legacyAssetMigrationPromise = null
let legacyAssetMigrationStatus = { state: 'idle', scannedEntries: 0, migratedEntries: 0, migratedAssets: 0, failedEntries: 0 }
let autoUpdateService = null

protocol.registerSchemesAsPrivileged([
  { scheme: 'deek-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

function registerAssetProtocol() {
  protocol.handle('deek-asset', async (request) => {
    const url = new URL(request.url)
    const relativePath = decodeURIComponent(url.pathname).replace(/^[/\\]+/, '')
    if (url.hostname === 'managed-assets') {
      try {
        const stored = await getActiveAssetStorage().get(relativePath)
        const body = typeof stored.body?.transformToWebStream === 'function'
          ? stored.body.transformToWebStream()
          : Readable.toWeb(stored.body)
        const headers = { 'Content-Type': stored.contentType ?? mimeTypeForFileName(relativePath) }
        if (stored.contentLength !== undefined) headers['Content-Length'] = String(stored.contentLength)
        return new Response(body, { headers })
      } catch (error) {
        return new Response(error && error.message ? error.message : 'Asset not found', { status: 404 })
      }
    }
    const root = url.hostname === 'wolai-assets' ? path.join(app.getPath('userData'), 'wolai-assets') : null
    if (!root) return new Response('Forbidden', { status: 403 })
    const target = path.resolve(root, relativePath)
    if (target !== root && !target.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(target).toString())
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: 'Deek PM',
    icon: isDev
      ? path.join(__dirname, '..', 'public', 'deek-logo-mark.png')
      : path.join(__dirname, '..', 'dist', 'deek-logo-mark.png'),
    backgroundColor: '#f6f7fb',
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    if (url === current || url.startsWith(`${current.split('#')[0]}#`)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function getLocalStorePath() {
  return path.join(app.getPath('userData'), localStoreFileName)
}

function getManagedAssetsRoot() {
  if (localDatabaseService) {
    try {
      const settings = localDatabaseService.handle('getLocalStorageSettings')
      if (settings?.configured && typeof settings.basePath === 'string') {
        return path.join(path.resolve(settings.basePath), customManagedAssetsDirectoryName)
      }
    } catch {
      // The local database may still be locked. The renderer unlock flow will retry later.
    }
  }
  return path.join(app.getPath('userData'), 'managed-assets')
}

function getManagedAssetsRootForBasePath(basePath) {
  return basePath === null
    ? path.join(app.getPath('userData'), 'managed-assets')
    : path.join(path.resolve(basePath), customManagedAssetsDirectoryName)
}

function runtimeAssetStorageSettings(settings = localDatabaseService?.getAssetStorageSettings()) {
  if (settings?.driver === 's3') return settings
  return { driver: 'filesystem', rootPath: getManagedAssetsRootForBasePath(settings?.basePath ?? null) }
}

function getActiveAssetStorage() {
  return createAssetStorage(runtimeAssetStorageSettings())
}

function normalizeAssetStorageInput(input, current) {
  if (input?.driver === 'filesystem') {
    const basePath = input.basePath === null || input.basePath === '' ? null : input.basePath
    if (basePath !== null && (typeof basePath !== 'string' || !path.isAbsolute(basePath.trim()))) throw new Error('请选择本机绝对目录')
    return { driver: 'filesystem', basePath: basePath === null ? null : path.resolve(basePath.trim()) }
  }
  if (input?.driver !== 's3') throw new Error('Invalid local asset storage driver')
  const credentials = input.credentials?.accessKey && input.credentials?.secretKey
    ? { accessKey: input.credentials.accessKey.trim(), secretKey: input.credentials.secretKey }
    : current?.driver === 's3' ? current.credentials : null
  const endpoint = String(input.endpoint ?? '').replace(/\/$/, '')
  const bucket = String(input.bucket ?? '').trim()
  if (!/^https?:\/\//i.test(endpoint) || !bucket || !credentials) throw new Error('S3 Endpoint、Bucket 和凭据不能为空')
  return {
    driver: 's3',
    endpoint,
    region: String(input.region || 'us-east-1').trim(),
    bucket,
    forcePathStyle: input.forcePathStyle !== false,
    credentials,
  }
}

function sameAssetStorageLocation(left, right) {
  if (left.driver !== right.driver) return false
  if (left.driver === 'filesystem') return path.resolve(left.rootPath).toLowerCase() === path.resolve(right.rootPath).toLowerCase()
  return left.endpoint === right.endpoint && left.region === right.region && left.bucket === right.bucket && left.forcePathStyle === right.forcePathStyle
}

async function migrateRegisteredAssets(localDatabase, sourceSettings, targetSettings) {
  const target = createAssetStorage(targetSettings)
  await target.verifyWritable()
  if (sameAssetStorageLocation(sourceSettings, targetSettings)) return { files: 0, totalBytes: 0 }
  const source = createAssetStorage(sourceSettings)
  if (sourceSettings.driver === 'filesystem') {
    for (const filePath of await listManagedAssetFiles(sourceSettings.rootPath)) {
      const match = path.basename(filePath).match(/^([a-f0-9]{64})(?:\.|$)/i)
      if (!match) continue
      const sha256 = match[1].toLowerCase()
      if (localDatabase.handle('getAsset', { id: `local-${sha256}` })) continue
      const metadata = await fs.stat(filePath)
      const objectKey = path.relative(sourceSettings.rootPath, filePath).split(path.sep).join('/')
      localDatabase.handle('upsertAsset', localManagedAsset({
        kind: 'attachment',
        name: path.basename(filePath),
        mimeType: mimeTypeForFileName(filePath),
        sizeBytes: metadata.size,
        sha256,
        objectKey,
      }))
    }
  }
  const records = localDatabase.handle('listAssets')
  return migrateAssetRecords(source, target, records)
}

async function processLocalAssetCleanupJobs(localDatabase) {
  const storage = getActiveAssetStorage()
  let completed = 0
  let failed = 0
  for (const job of localDatabase.handle('listPendingAssetCleanupJobs')) {
    try {
      await storage.delete(job.objectKey)
      localDatabase.handle('completeAssetCleanup', { jobId: job.id, assetId: job.assetId })
      completed += 1
    } catch (error) {
      localDatabase.handle('failAssetCleanup', { jobId: job.id, error: error && error.message ? error.message : String(error) })
      failed += 1
    }
  }
  return { completed, failed }
}

function startLegacyInlineImageMigration(localDatabase) {
  if (legacyAssetMigrationPromise) return legacyAssetMigrationPromise
  if (managedAssetsMigrationInProgress) return Promise.resolve({ skipped: true })
  managedAssetsMigrationInProgress = true
  legacyAssetMigrationStatus = { state: 'running', scannedEntries: 0, migratedEntries: 0, migratedAssets: 0, failedEntries: 0 }
  legacyAssetMigrationPromise = migrateLegacyInlineImages({
    database: localDatabase,
    storage: getActiveAssetStorage(),
    onProgress: (progress) => {
      legacyAssetMigrationStatus = { state: 'running', ...progress, errors: undefined }
    },
  }).then((result) => {
    legacyAssetMigrationStatus = { state: 'completed', ...result, errors: undefined }
    if (result.scannedEntries > 0) console.info('旧正文图片迁移完成', result)
    return result
  }).catch((error) => {
    legacyAssetMigrationStatus = {
      ...legacyAssetMigrationStatus,
      state: 'failed',
      error: error && error.message ? error.message : String(error),
    }
    throw error
  }).finally(() => {
    managedAssetsMigrationInProgress = false
    legacyAssetMigrationPromise = null
  })
  return legacyAssetMigrationPromise
}

async function exportActiveAssetsForBackup(localDatabase) {
  const settings = localDatabaseService.getAssetStorageSettings()
  if (settings.driver === 'filesystem') return exportManagedAssetsForBackup(runtimeAssetStorageSettings(settings).rootPath)
  const storage = createAssetStorage(settings)
  const maxFileBytes = 16 * 1024 * 1024
  const totalMaxBytes = 64 * 1024 * 1024
  const assets = []
  const omitted = []
  let includedBytes = 0
  for (const asset of localDatabase.handle('listAssets')) {
    if (asset.status !== 'ready') continue
    if (asset.sizeBytes > maxFileBytes || includedBytes + asset.sizeBytes > totalMaxBytes) {
      omitted.push({ relativePath: asset.objectKey, sizeBytes: asset.sizeBytes })
      continue
    }
    const stored = await storage.get(asset.objectKey)
    const chunks = []
    let size = 0
    for await (const chunk of stored.body) {
      const bytes = Buffer.from(chunk)
      size += bytes.length
      if (size > maxFileBytes) throw new Error(`资产大小与元数据不一致：${asset.originalName}`)
      chunks.push(bytes)
    }
    assets.push({ relativePath: asset.objectKey, contentBase64: Buffer.concat(chunks).toString('base64') })
    includedBytes += size
  }
  return { assets, omitted }
}

async function restoreActiveAssets(localDatabase, assets) {
  const settings = localDatabaseService.getAssetStorageSettings()
  if (settings.driver === 'filesystem') return restoreManagedAssetsMerged(runtimeAssetStorageSettings(settings).rootPath, assets)
  if (!Array.isArray(assets)) throw new Error('Invalid local assets payload')
  const storage = createAssetStorage(settings)
  for (const asset of assets) {
    if (!asset || typeof asset.relativePath !== 'string' || typeof asset.contentBase64 !== 'string') throw new Error('Invalid local asset in backup')
    const segments = asset.relativePath.replace(/\\/g, '/').split('/')
    if (asset.relativePath.startsWith('/') || segments.some((segment) => !segment || segment === '.' || segment === '..')) throw new Error('Invalid local asset path')
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(asset.contentBase64)) throw new Error('Invalid local asset content')
    await storage.putBuffer(asset.relativePath, Buffer.from(asset.contentBase64, 'base64'))
  }
}

function localManagedAsset({ workspaceId, kind, name, mimeType, sizeBytes, sha256, objectKey, createdAt = new Date().toISOString() }) {
  return {
    id: `local-${sha256}`,
    workspaceId: typeof workspaceId === 'string' ? workspaceId : 'local-personal',
    kind: kind === 'attachment' ? 'attachment' : 'image',
    originalName: name,
    mimeType,
    sizeBytes,
    sha256,
    objectKey,
    status: 'ready',
    storedUrl: `deek-asset://managed-assets/${objectKey}`,
    createdAt,
  }
}

function mimeTypeForFileName(name) {
  const extension = path.extname(name).toLowerCase()
  return ({
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.zip': 'application/zip', '.7z': 'application/x-7z-compressed', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  })[extension] ?? 'application/octet-stream'
}

async function readJsonFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

function getEventWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  const localDatabase = createLocalDatabaseService({ app, safeStorage })
  localDatabaseService = localDatabase
  registerAssetProtocol()
  autoUpdateService = createAutoUpdateService({ app, autoUpdater, getWindows: () => BrowserWindow.getAllWindows() })
  void processLocalAssetCleanupJobs(localDatabase)
    .then(() => startLegacyInlineImageMigration(localDatabase))
    .catch((error) => console.error('本地资产后台维护失败', error))

  ipcMain.handle('deek:get-runtime-info', async () => ({
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    documentsPath: app.getPath('documents'),
    safeStorageAvailable: safeStorage.isEncryptionAvailable(),
    localDatabasePath: localDatabase.databasePath,
  }))

  ipcMain.handle('deek:get-update-state', async () => autoUpdateService.getState())
  ipcMain.handle('deek:check-for-updates', async () => autoUpdateService.check())
  ipcMain.handle('deek:download-update', async () => autoUpdateService.download())
  ipcMain.handle('deek:install-update', async () => ({ ok: autoUpdateService.install() }))

  ipcMain.handle('deek:get-legacy-asset-migration-status', async () => legacyAssetMigrationStatus)

  ipcMain.handle('deek:local-repository', async (_event, action, payload) => {
    if (typeof action !== 'string' || action.trim().length === 0) return { ok: false, error: 'Invalid local repository action' }
    try {
      const data = localDatabase.handle(action, payload)
      if (action === 'importBackup' || (action === 'updateEntry' && typeof payload?.textContent === 'string' && /data:image\//i.test(payload.textContent))) {
        void startLegacyInlineImageMigration(localDatabase).catch((error) => console.error('旧正文图片迁移失败', error))
      }
      return { ok: true, data }
    } catch (error) {
      return {
        ok: false,
        error: error && error.message ? error.message : 'Local repository action failed',
        code: error && error.code ? error.code : undefined,
      }
    }
  })

  ipcMain.handle('deek:import-local-asset', async (_event, payload = {}) => {
    try {
      if (managedAssetsMigrationInProgress) return { ok: false, error: '本地文件存储正在迁移，请稍后再试' }
      if (!payload.bytes || typeof payload.name !== 'string' || typeof payload.mimeType !== 'string') {
        return { ok: false, error: 'Invalid local asset payload' }
      }
      const bytes = Buffer.from(payload.bytes)
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
      const extension = path.extname(payload.name).replace(/[^.a-z0-9]/gi, '').slice(0, 12)
      const relativePath = path.posix.join(sha256.slice(0, 2), `${sha256}${extension}`)
      const existing = localDatabase.handle('getAsset', { id: `local-${sha256}` })
      if (existing?.status === 'ready') return { ok: true, data: existing }
      await getActiveAssetStorage().putBuffer(relativePath, bytes, payload.mimeType)
      const asset = localManagedAsset({
        workspaceId: payload.workspaceId,
        kind: payload.kind,
        name: payload.name,
        mimeType: payload.mimeType,
        sizeBytes: bytes.length,
        sha256,
        objectKey: relativePath,
      })
      return { ok: true, data: localDatabase.handle('upsertAsset', asset) }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to import local asset' }
    }
  })

  ipcMain.handle('deek:import-local-asset-path', async (_event, payload = {}) => {
    try {
      if (managedAssetsMigrationInProgress) return { ok: false, error: '本地文件存储正在迁移，请稍后再试' }
      if (typeof payload.filePath !== 'string' || !path.isAbsolute(payload.filePath)) return { ok: false, error: 'Invalid local asset path' }
      const source = path.resolve(payload.filePath)
      const metadata = await fs.stat(source)
      if (!metadata.isFile()) return { ok: false, error: '请选择文件，而不是目录' }
      const originalName = path.basename(source)
      const sha256 = await hashFile(source)
      const extension = path.extname(originalName).replace(/[^.a-z0-9]/gi, '').slice(0, 12)
      const relativePath = path.posix.join(sha256.slice(0, 2), `${sha256}${extension}`)
      const existing = localDatabase.handle('getAsset', { id: `local-${sha256}` })
      if (existing?.status === 'ready') return { ok: true, data: existing }
      const mimeType = mimeTypeForFileName(originalName)
      await getActiveAssetStorage().putFile(relativePath, source, mimeType)
      const asset = localManagedAsset({
        workspaceId: payload.workspaceId,
        kind: payload.kind,
        name: originalName,
        mimeType,
        sizeBytes: metadata.size,
        sha256,
        objectKey: relativePath,
      })
      return { ok: true, data: localDatabase.handle('upsertAsset', asset) }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to import local asset path' }
    }
  })

  ipcMain.handle('deek:get-local-storage-settings', async () => {
    try {
      const settings = localDatabase.handle('getLocalStorageSettings')
      return {
        ok: true,
        data: {
          ...settings,
          assetsPath: settings.driver === 's3' ? `s3://${settings.bucket}` : getManagedAssetsRoot(),
          defaultPath: getManagedAssetsRootForBasePath(null),
        },
      }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to read local storage settings' }
    }
  })

  ipcMain.handle('deek:test-local-asset-storage', async (_event, input) => {
    try {
      const current = localDatabaseService.getAssetStorageSettings()
      const normalized = normalizeAssetStorageInput(input, current)
      const runtime = runtimeAssetStorageSettings(normalized)
      await createAssetStorage(runtime).verifyWritable()
      return { ok: true, data: { driver: normalized.driver } }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Asset storage test failed' }
    }
  })

  ipcMain.handle('deek:set-local-asset-storage', async (_event, input) => {
    if (managedAssetsMigrationInProgress) return { ok: false, error: '本地文件存储正在迁移' }
    managedAssetsMigrationInProgress = true
    try {
      const current = localDatabaseService.getAssetStorageSettings()
      const normalized = normalizeAssetStorageInput(input, current)
      const sourceRuntime = runtimeAssetStorageSettings(current)
      const targetRuntime = runtimeAssetStorageSettings(normalized)
      const migration = await migrateRegisteredAssets(localDatabase, sourceRuntime, targetRuntime)
      const saved = localDatabaseService.setAssetStorageSettings(normalized)
      return { ok: true, data: { ...saved, migratedFiles: migration.files, migratedBytes: migration.totalBytes } }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to migrate local asset storage' }
    } finally {
      managedAssetsMigrationInProgress = false
    }
  })

  ipcMain.handle('deek:test-local-storage-path', async (_event, basePath) => {
    try {
      if (typeof basePath !== 'string' || !path.isAbsolute(basePath.trim())) return { ok: false, error: '请选择本机绝对目录' }
      const root = getManagedAssetsRootForBasePath(basePath.trim())
      await fs.mkdir(root, { recursive: true })
      const probe = path.join(root, `.deek-write-test-${crypto.randomUUID()}`)
      await fs.writeFile(probe, 'ok', { flag: 'wx' })
      await fs.unlink(probe)
      return { ok: true, data: { assetsPath: root } }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Local storage path is not writable' }
    }
  })

  ipcMain.handle('deek:set-local-storage-path', async (_event, basePath) => {
    if (managedAssetsMigrationInProgress) return { ok: false, error: '本地文件存储正在迁移' }
    const normalizedBasePath = basePath === null
      ? null
      : typeof basePath === 'string' && path.isAbsolute(basePath.trim())
        ? path.resolve(basePath.trim())
        : undefined
    if (normalizedBasePath === undefined) return { ok: false, error: '请选择本机绝对目录' }
    const sourceRoot = getManagedAssetsRoot()
    const targetRoot = getManagedAssetsRootForBasePath(normalizedBasePath)
    if (sourceRoot.toLowerCase() === targetRoot.toLowerCase()) {
      const settings = localDatabase.handle('setLocalStorageSettings', { basePath: normalizedBasePath })
      return { ok: true, data: { ...settings, assetsPath: targetRoot, migratedFiles: 0, migratedBytes: 0 } }
    }
    const sourceLower = sourceRoot.toLowerCase()
    const targetLower = targetRoot.toLowerCase()
    if (targetLower.startsWith(sourceLower + path.sep) || sourceLower.startsWith(targetLower + path.sep)) {
      return { ok: false, error: '新目录不能位于当前资产目录内部，也不能包含当前资产目录' }
    }
    managedAssetsMigrationInProgress = true
    try {
      await fs.mkdir(targetRoot, { recursive: true })
      const migration = await copyManagedAssetsVerified(sourceRoot, targetRoot)
      const settings = localDatabase.handle('setLocalStorageSettings', { basePath: normalizedBasePath })
      let cleanupWarning
      try {
        const safeRootName = path.basename(sourceRoot).toLowerCase()
        if (!['managed-assets', customManagedAssetsDirectoryName].includes(safeRootName)) throw new Error('拒绝清理非 Deek PM 资产目录')
        await fs.rm(sourceRoot, { recursive: true, force: true })
      } catch (error) {
        cleanupWarning = error && error.message ? error.message : '旧目录未能自动清理'
      }
      return {
        ok: true,
        data: {
          ...settings,
          assetsPath: targetRoot,
          migratedFiles: migration.files,
          migratedBytes: migration.totalBytes,
          cleanupWarning,
        },
      }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to migrate local storage' }
    } finally {
      managedAssetsMigrationInProgress = false
    }
  })

  ipcMain.handle('deek:open-local-assets-dir', async () => {
    const settings = localDatabase.handle('getLocalStorageSettings')
    if (settings.driver === 's3') return { ok: false, error: 'S3 存储没有可打开的本机目录' }
    const root = getManagedAssetsRoot()
    await fs.mkdir(root, { recursive: true })
    const error = await shell.openPath(root)
    return { ok: error.length === 0, error }
  })

  ipcMain.handle('deek:delete-local-asset', async (_event, assetId) => {
    try {
      if (typeof assetId !== 'string' || !/^local-[a-f0-9]{64}$/i.test(assetId)) {
        return { ok: false, error: 'Invalid local asset id' }
      }
      if (localDatabase.handle('isAssetReferenced', { id: assetId })) return { ok: true }
      const asset = localDatabase.handle('getAsset', { id: assetId })
      if (!asset) return { ok: true }
      localDatabase.handle('enqueueAssetCleanup', { id: assetId })
      const cleanup = await processLocalAssetCleanupJobs(localDatabase)
      return { ok: true, data: cleanup }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to delete local asset' }
    }
  })

  ipcMain.handle('deek:prune-local-assets', async (_event, referencedAssetIds) => {
    try {
      if (!Array.isArray(referencedAssetIds) || referencedAssetIds.some((id) => typeof id !== 'string' || !/^local-[a-f0-9]{64}$/i.test(id))) {
        return { ok: false, error: 'Invalid referenced local asset ids' }
      }
      const referenced = new Set(referencedAssetIds.map((id) => id.toLowerCase()))
      let queued = 0
      for (const asset of localDatabase.handle('listAssets')) {
        if (asset.status !== 'ready' || referenced.has(asset.id.toLowerCase())) continue
        if (localDatabase.handle('enqueueAssetCleanup', { id: asset.id })) queued += 1
      }
      const cleanup = await processLocalAssetCleanupJobs(localDatabase)
      return { ok: true, data: { deleted: cleanup.completed, queued, pending: cleanup.failed } }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to prune local assets' }
    }
  })

  ipcMain.handle('deek:export-local-assets', async () => {
    try {
      return { ok: true, data: await exportActiveAssetsForBackup(localDatabase) }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to export local assets' }
    }
  })

  ipcMain.handle('deek:restore-local-assets', async (_event, assets) => {
    try {
      await restoreActiveAssets(localDatabase, assets)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to restore local assets' }
    }
  })

  ipcMain.handle('deek:get-local-security-status', async () => {
    try {
      return { ok: true, data: localDatabase.getSecurityStatus() }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to read local security status' }
    }
  })

  ipcMain.handle('deek:set-local-master-password', async (_event, payload) => {
    try {
      return { ok: true, data: localDatabase.setMasterPassword(payload ?? {}) }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to set local master password' }
    }
  })

  ipcMain.handle('deek:unlock-local-database', async (_event, payload) => {
    try {
      const data = localDatabase.unlock(payload ?? {})
      void processLocalAssetCleanupJobs(localDatabase)
        .then(() => startLegacyInlineImageMigration(localDatabase))
        .catch((error) => console.error('本地资产后台维护失败', error))
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to unlock local database' }
    }
  })

  ipcMain.handle('deek:lock-local-database', async (_event, payload) => {
    try {
      return { ok: true, data: localDatabase.lock(payload ?? {}) }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to lock local database' }
    }
  })

  ipcMain.handle('deek:disable-local-master-password', async () => {
    try {
      return { ok: true, data: localDatabase.disableMasterPassword() }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to disable local master password' }
    }
  })

  ipcMain.handle('deek:open-external', async (event, target) => {
    if (typeof target !== 'string' || target.trim().length === 0) return { ok: false }

    const normalizedTarget = target.trim()
    if (/^https?:\/\//i.test(normalizedTarget)) {
      await shell.openExternal(normalizedTarget)
      return { ok: true }
    }

    if (!path.isAbsolute(normalizedTarget)) return { ok: false, error: '只允许打开 HTTP(S) 地址或本机绝对路径' }
    try {
      await fs.stat(normalizedTarget)
    } catch {
      return { ok: false, error: '目标文件或目录不存在' }
    }
    if (/\.(exe|com|bat|cmd|ps1|msi|lnk|url)$/i.test(normalizedTarget)) {
      const owner = getEventWindow(event)
      const options = {
        type: 'warning',
        title: '确认打开可执行目标',
        message: '该目标可能会运行程序或命令。确认继续吗？',
        detail: normalizedTarget,
        buttons: ['取消', '继续打开'],
        defaultId: 0,
        cancelId: 0,
      }
      const confirmation = owner
        ? await dialog.showMessageBox(owner, options)
        : await dialog.showMessageBox(options)
      if (confirmation.response !== 1) return { ok: false, canceled: true }
    }
    const error = await shell.openPath(normalizedTarget)
    return { ok: error.length === 0, error }
  })

  ipcMain.handle('deek:stat-path', async (_event, target) => {
    if (typeof target !== 'string' || target.trim().length === 0) return { ok: false, exists: false, error: 'Invalid path' }
    try {
      const stats = await fs.stat(target.trim())
      return {
        ok: true,
        exists: true,
        kind: stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other',
        updatedAt: stats.mtime.toISOString(),
      }
    } catch (error) {
      if (error && error.code === 'ENOENT') return { ok: true, exists: false }
      return { ok: false, exists: false, error: error && error.message ? error.message : 'Unable to inspect path' }
    }
  })

  ipcMain.handle('deek:show-in-folder', async (_event, target) => {
    if (typeof target !== 'string' || target.trim().length === 0) return { ok: false, error: 'Invalid path' }
    shell.showItemInFolder(target.trim())
    return { ok: true }
  })

  ipcMain.handle('deek:select-backup-dir', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('deek:select-path', async (_event, options = {}) => {
    const kind = options.kind === 'file' || options.kind === 'any' ? options.kind : 'directory'
    const result = await dialog.showOpenDialog({
      properties: kind === 'any' ? ['openFile', 'openDirectory'] : kind === 'file' ? ['openFile'] : ['openDirectory'],
      title: typeof options.title === 'string' ? options.title : undefined,
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('deek:write-backup-file', async (_event, content) => {
    if (typeof content !== 'string') return { ok: false, error: 'Invalid backup content' }
    const result = await dialog.showSaveDialog({
      title: '保存 Deek PM 备份',
      defaultPath: `deek-backup-${new Date().toISOString().slice(0, 10)}.deekbak`,
      filters: [{ name: 'Deek PM Backup', extensions: ['deekbak', 'json'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }
    await fs.writeFile(result.filePath, content, 'utf8')
    return { ok: true, filePath: result.filePath }
  })

  ipcMain.handle('deek:write-encrypted-backup-file', async (_event, content, password) => {
    if (typeof content !== 'string') return { ok: false, error: 'Invalid backup content' }
    if (typeof password !== 'string' || password.length < 8) return { ok: false, error: '备份密码至少需要 8 个字符' }
    const result = await dialog.showSaveDialog({
      title: '保存 Deek PM 加密备份',
      defaultPath: `deek-backup-${new Date().toISOString().slice(0, 10)}.deekbak`,
      filters: [{ name: 'Deek PM Encrypted Backup', extensions: ['deekbak'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }
    const envelope = await createEncryptedBackupEnvelope(content, password)
    await fs.writeFile(result.filePath, JSON.stringify(envelope), 'utf8')
    return { ok: true, filePath: result.filePath, encrypted: true }
  })

  ipcMain.handle('deek:write-backup-to-directory', async (_event, directory, content) => {
    if (typeof directory !== 'string' || directory.trim().length === 0) return { ok: false, error: 'Invalid backup directory' }
    if (typeof content !== 'string') return { ok: false, error: 'Invalid backup content' }
    const filePath = path.join(directory, `deek-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.deekbak`)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(filePath, content, 'utf8')
    return { ok: true, filePath }
  })

  ipcMain.handle('deek:write-encrypted-backup-to-directory', async (_event, directory, content, password) => {
    if (typeof directory !== 'string' || directory.trim().length === 0) return { ok: false, error: 'Invalid backup directory' }
    if (typeof content !== 'string') return { ok: false, error: 'Invalid backup content' }
    if (typeof password !== 'string' || password.length < 8) return { ok: false, error: '备份密码至少需要 8 个字符' }
    const targetDirectory = directory.trim()
    const filePath = path.join(targetDirectory, `deek-auto-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.deekbak`)
    await fs.mkdir(targetDirectory, { recursive: true })
    const envelope = await createEncryptedBackupEnvelope(content, password)
    await fs.writeFile(filePath, JSON.stringify(envelope), 'utf8')
    const files = (await fs.readdir(targetDirectory))
      .filter((name) => /^deek-auto-backup-.*\.deekbak$/i.test(name))
      .sort()
    for (const expired of files.slice(0, Math.max(0, files.length - 20))) {
      await fs.unlink(path.join(targetDirectory, expired)).catch(() => undefined)
    }
    return { ok: true, filePath, encrypted: true }
  })

  ipcMain.handle('deek:read-backup-file', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 Deek PM 备份',
      properties: ['openFile'],
      filters: [{ name: 'Deek PM Backup', extensions: ['deekbak', 'json'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }
    const filePath = result.filePaths[0]
    const content = await fs.readFile(filePath, 'utf8')
    return { ok: true, filePath, content }
  })

  ipcMain.handle('deek:decrypt-backup-content', async (_event, content, password) => {
    if (typeof content !== 'string') return { ok: false, error: 'Invalid backup content' }
    if (typeof password !== 'string' || password.length < 8) return { ok: false, error: '备份密码至少需要 8 个字符' }
    const parsed = JSON.parse(content)
    if (!isEncryptedBackupEnvelope(parsed)) return { ok: true, content, encrypted: false }
    try {
      return { ok: true, content: await decryptEncryptedBackupEnvelope(parsed, password), encrypted: true }
    } catch {
      return { ok: false, error: '备份密码不正确或备份文件已损坏' }
    }
  })

  ipcMain.handle('deek:read-encrypted-backup-file', async (_event, password) => {
    if (typeof password !== 'string' || password.length < 8) return { ok: false, error: '备份密码至少需要 8 个字符' }
    const result = await dialog.showOpenDialog({
      title: '选择 Deek PM 加密备份',
      properties: ['openFile'],
      filters: [{ name: 'Deek PM Backup', extensions: ['deekbak', 'json'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }
    const filePath = result.filePaths[0]
    const content = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(content)
    if (!isEncryptedBackupEnvelope(parsed)) return { ok: true, filePath, content, encrypted: false }
    try {
      return { ok: true, filePath, content: await decryptEncryptedBackupEnvelope(parsed, password), encrypted: true }
    } catch {
      return { ok: false, filePath, error: '备份密码不正确或备份文件已损坏' }
    }
  })

  ipcMain.handle('deek:read-local-store', async () => {
    const filePath = getLocalStorePath()
    const raw = await readJsonFile(filePath)
    if (!raw) return { ok: true, filePath, content: null, encrypted: false }

    const envelope = JSON.parse(raw)
    if (envelope.encrypted) {
      if (!safeStorage.isEncryptionAvailable()) {
        return { ok: false, filePath, error: '当前系统无法解密本地数据' }
      }
      const content = safeStorage.decryptString(Buffer.from(envelope.data, 'base64'))
      return { ok: true, filePath, content, encrypted: true }
    }

    return { ok: true, filePath, content: envelope.data ?? raw, encrypted: false }
  })

  ipcMain.handle('deek:write-local-store', async (_event, content) => {
    if (typeof content !== 'string') return { ok: false, error: 'Invalid local store content' }
    const filePath = getLocalStorePath()
    const canEncrypt = safeStorage.isEncryptionAvailable()
    const envelope = canEncrypt
      ? { version: 1, encrypted: true, data: safeStorage.encryptString(content).toString('base64') }
      : { version: 1, encrypted: false, data: content }

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(envelope), 'utf8')
    return { ok: true, filePath, encrypted: canEncrypt }
  })

  ipcMain.handle('deek:open-user-data-dir', async () => {
    const error = await shell.openPath(app.getPath('userData'))
    return { ok: error.length === 0, error }
  })

  ipcMain.handle('deek:clear-local-store', async () => {
    const managedAssetsRoot = getManagedAssetsRoot()
    await localDatabase.clear()
    const filePath = getLocalStorePath()
    try {
      await fs.unlink(filePath)
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error
    }
    const safeRootName = path.basename(managedAssetsRoot).toLowerCase()
    if (['managed-assets', customManagedAssetsDirectoryName].includes(safeRootName)) {
      await fs.rm(managedAssetsRoot, { recursive: true, force: true })
    }
    return { ok: true, filePath }
  })

  ipcMain.handle('deek:safe-encrypt-text', async (_event, value) => {
    if (typeof value !== 'string') return null
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.encryptString(value).toString('base64')
  })

  ipcMain.handle('deek:safe-decrypt-text', async (_event, encryptedValue) => {
    if (typeof encryptedValue !== 'string') return null
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(Buffer.from(encryptedValue, 'base64'))
  })

  const minimizeWindow = (event) => {
    getEventWindow(event)?.minimize()
  }

  const toggleMaximizeWindow = (event) => {
    const win = getEventWindow(event)
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
      return
    }
    win.maximize()
  }

  const closeWindow = (event) => {
    getEventWindow(event)?.close()
  }

  ipcMain.on('deek:window-minimize', minimizeWindow)
  ipcMain.on('deek:window-toggle-maximize', toggleMaximizeWindow)
  ipcMain.on('deek:window-close', closeWindow)

  ipcMain.handle('deek:window-minimize', async (event) => {
    minimizeWindow(event)
    return { ok: true }
  })

  ipcMain.handle('deek:window-toggle-maximize', async (event) => {
    toggleMaximizeWindow(event)
    return { ok: true }
  })

  ipcMain.handle('deek:window-close', async (event) => {
    closeWindow(event)
    return { ok: true }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
