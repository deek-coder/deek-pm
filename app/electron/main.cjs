const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage, Menu, protocol, net } = require('electron')
const fs = require('node:fs/promises')
const { constants: fsConstants } = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const crypto = require('node:crypto')
const { createLocalDatabaseService } = require('./local-database.cjs')
const { copyManagedAssetsVerified, exportManagedAssetsForBackup, hashFile, listManagedAssetFiles } = require('./local-asset-files.cjs')
const {
  createEncryptedBackupEnvelope,
  decryptEncryptedBackupEnvelope,
  isEncryptedBackupEnvelope,
} = require('./backup-crypto.cjs')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const localStoreFileName = 'deek-local-store.json'
const customManagedAssetsDirectoryName = 'deek-pm-assets'
let localDatabaseService = null
let managedAssetsMigrationInProgress = false

protocol.registerSchemesAsPrivileged([
  { scheme: 'deek-asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

function registerAssetProtocol() {
  protocol.handle('deek-asset', (request) => {
    const url = new URL(request.url)
    const relativePath = decodeURIComponent(url.pathname).replace(/^[/\\]+/, '')
    const root = url.hostname === 'managed-assets'
      ? getManagedAssetsRoot()
      : url.hostname === 'wolai-assets'
        ? path.join(app.getPath('userData'), 'wolai-assets')
        : null
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

function mimeTypeForFileName(name) {
  const extension = path.extname(name).toLowerCase()
  return ({
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.zip': 'application/zip', '.7z': 'application/x-7z-compressed', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  })[extension] ?? 'application/octet-stream'
}

function resolveManagedAssetPath(relativePath, root = getManagedAssetsRoot()) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error('Invalid managed asset path')
  }
  const target = path.resolve(root, ...relativePath.replace(/\\/g, '/').split('/'))
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Invalid managed asset path')
  return target
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

  ipcMain.handle('deek:get-runtime-info', async () => ({
    platform: process.platform,
    userDataPath: app.getPath('userData'),
    documentsPath: app.getPath('documents'),
    safeStorageAvailable: safeStorage.isEncryptionAvailable(),
    localDatabasePath: localDatabase.databasePath,
  }))

  ipcMain.handle('deek:local-repository', async (_event, action, payload) => {
    if (typeof action !== 'string' || action.trim().length === 0) return { ok: false, error: 'Invalid local repository action' }
    try {
      return { ok: true, data: localDatabase.handle(action, payload) }
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
      const root = getManagedAssetsRoot()
      const target = path.join(root, ...relativePath.split('/'))
      await fs.mkdir(path.dirname(target), { recursive: true })
      try {
        await fs.writeFile(target, bytes, { flag: 'wx' })
      } catch (error) {
        if (!error || error.code !== 'EEXIST') throw error
      }
      return {
        ok: true,
        data: {
          id: `local-${sha256}`,
          workspaceId: typeof payload.workspaceId === 'string' ? payload.workspaceId : 'local-personal',
          kind: payload.kind === 'attachment' ? 'attachment' : 'image',
          originalName: payload.name,
          mimeType: payload.mimeType,
          sizeBytes: bytes.length,
          storedUrl: `deek-asset://managed-assets/${relativePath}`,
          createdAt: new Date().toISOString(),
        },
      }
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
      const root = getManagedAssetsRoot()
      const target = resolveManagedAssetPath(relativePath, root)
      await fs.mkdir(path.dirname(target), { recursive: true })
      if (source.toLowerCase() !== target.toLowerCase()) {
        try {
          await fs.copyFile(source, target, fsConstants.COPYFILE_EXCL)
        } catch (error) {
          if (!error || error.code !== 'EEXIST') throw error
          if (await hashFile(target) !== sha256) throw new Error('托管目录存在同名但内容不一致的文件')
        }
      }
      return {
        ok: true,
        data: {
          id: `local-${sha256}`,
          workspaceId: typeof payload.workspaceId === 'string' ? payload.workspaceId : 'local-personal',
          kind: payload.kind === 'image' ? 'image' : 'attachment',
          originalName,
          mimeType: mimeTypeForFileName(originalName),
          sizeBytes: metadata.size,
          storedUrl: `deek-asset://managed-assets/${relativePath}`,
          createdAt: new Date().toISOString(),
        },
      }
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
          assetsPath: getManagedAssetsRoot(),
          defaultPath: getManagedAssetsRootForBasePath(null),
        },
      }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to read local storage settings' }
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
      const sha256 = assetId.slice('local-'.length).toLowerCase()
      const directory = path.join(getManagedAssetsRoot(), sha256.slice(0, 2))
      let names
      try {
        names = await fs.readdir(directory)
      } catch (error) {
        if (error && error.code === 'ENOENT') return { ok: true }
        throw error
      }
      await Promise.all(
        names
          .filter((name) => name === sha256 || name.startsWith(`${sha256}.`))
          .map((name) => fs.unlink(path.join(directory, name))),
      )
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to delete local asset' }
    }
  })

  ipcMain.handle('deek:prune-local-assets', async (_event, referencedAssetIds) => {
    try {
      if (!Array.isArray(referencedAssetIds) || referencedAssetIds.some((id) => typeof id !== 'string' || !/^local-[a-f0-9]{64}$/i.test(id))) {
        return { ok: false, error: 'Invalid referenced local asset ids' }
      }
      const referencedHashes = new Set(referencedAssetIds.map((id) => id.slice('local-'.length).toLowerCase()))
      const root = getManagedAssetsRoot()
      const files = await listManagedAssetFiles(root)
      let deleted = 0
      for (const filePath of files) {
        const match = path.basename(filePath).match(/^([a-f0-9]{64})(?:\.|$)/i)
        if (!match || referencedHashes.has(match[1].toLowerCase())) continue
        await fs.unlink(filePath)
        deleted += 1
      }
      return { ok: true, data: { deleted } }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to prune local assets' }
    }
  })

  ipcMain.handle('deek:export-local-assets', async () => {
    try {
      const root = getManagedAssetsRoot()
      return { ok: true, data: await exportManagedAssetsForBackup(root) }
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'Unable to export local assets' }
    }
  })

  ipcMain.handle('deek:restore-local-assets', async (_event, assets) => {
    const root = getManagedAssetsRoot()
    const stagingRoot = path.join(path.dirname(root), `.managed-assets-restore-${crypto.randomUUID()}`)
    const previousRoot = path.join(path.dirname(root), `.managed-assets-previous-${crypto.randomUUID()}`)
    let movedPrevious = false
    try {
      if (!Array.isArray(assets)) return { ok: false, error: 'Invalid local assets payload' }
      await fs.mkdir(stagingRoot, { recursive: true })
      for (const asset of assets) {
        if (!asset || typeof asset.relativePath !== 'string' || typeof asset.contentBase64 !== 'string') {
          throw new Error('Invalid local asset in backup')
        }
        const target = resolveManagedAssetPath(asset.relativePath, stagingRoot)
        const bytes = Buffer.from(asset.contentBase64, 'base64')
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, bytes, { flag: 'wx' })
      }
      try {
        await fs.rename(root, previousRoot)
        movedPrevious = true
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error
      }
      await fs.rename(stagingRoot, root)
      if (movedPrevious) await fs.rm(previousRoot, { recursive: true, force: true })
      return { ok: true }
    } catch (error) {
      await fs.rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined)
      if (movedPrevious) {
        await fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
        await fs.rename(previousRoot, root).catch(() => undefined)
      }
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
      return { ok: true, data: localDatabase.unlock(payload ?? {}) }
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
