const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const Database = require('better-sqlite3-multiple-ciphers')
const { createEncryptedBackupEnvelope, decryptEncryptedBackupEnvelope, isEncryptedBackupEnvelope } = require('../electron/backup-crypto.cjs')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')
const { copyManagedAssetsVerified, exportManagedAssetsForBackup } = require('../electron/local-asset-files.cjs')

const testPassword = 'deek-test-password'
const backupPassword = 'deek-backup-password'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function removeDir(dir) {
  await fsp.rm(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
}

function openRawDb(userData) {
  const key = JSON.parse(fs.readFileSync(path.join(userData, 'deek-local-key.json'), 'utf8')).data
  const db = new Database(path.join(userData, 'deek-local-v1.db'))
  db.pragma('cipher = sqlcipher')
  db.pragma(`key = '${key}'`)
  return db
}

app.whenReady().then(async () => {
  const userData = path.join(__dirname, '..', '.local-repository-test-user-data')
  await removeDir(userData)
  const testApp = {
    getPath(name) {
      if (name === 'userData') return userData
      return app.getPath(name)
    },
  }
  const fakeSafeStorage = {
    isEncryptionAvailable: () => false,
    encryptString: (value) => Buffer.from(value, 'utf8'),
    decryptString: (value) => value.toString('utf8'),
  }

  try {
    const service = createLocalDatabaseService({ app: testApp, safeStorage: fakeSafeStorage })
    const workspaces = service.handle('listWorkspaces')
    assert(workspaces.length === 1, 'should create only the local workspace')
    assert(service.handle('listProjects', { workspaceId: 'local-personal' }).length === 0, 'should not seed demo projects')
    assert(!service.handle('getLocalStorageSettings').configured, 'local asset storage should use the default path initially')
    const customStoragePath = path.join(userData, 'custom-storage')
    service.handle('setLocalStorageSettings', { basePath: customStoragePath })
    assert(service.handle('getLocalStorageSettings').basePath === customStoragePath, 'local asset storage path should persist in SQLCipher')
    service.handle('setLocalStorageSettings', { basePath: null })
    assert(!service.handle('getLocalStorageSettings').configured, 'local asset storage should return to its default path')
    const savedConnection = service.handle('saveServiceConnection', {
      baseUrl: 'http://127.0.0.1:3100',
      deployment: 'selfhost',
      accountEmail: 'admin@deek.local',
      instanceName: 'Local service',
      encryptedAccessToken: 'safe:test-token',
    })
    assert(service.handle('listSavedServiceConnections').length === 1, 'service connections should persist independently of the active mode')
    assert(service.handle('getSavedServiceConnection', { id: savedConnection.id }).encryptedAccessToken === 'safe:test-token', 'saved service sessions should remain available for activation')
    service.handle('deleteSavedServiceConnection', { id: savedConnection.id })
    assert(service.handle('listSavedServiceConnections').length === 0, 'saved service connections should be removable')
    const sourceAssets = path.join(userData, 'source-assets')
    const targetAssets = path.join(userData, 'target-assets')
    await fsp.mkdir(path.join(sourceAssets, 'aa'), { recursive: true })
    await fsp.writeFile(path.join(sourceAssets, 'aa', 'asset.bin'), Buffer.from('managed asset migration'))
    const migration = await copyManagedAssetsVerified(sourceAssets, targetAssets)
    assert(migration.files === 1 && migration.totalBytes === 23, 'managed asset migration should report copied files and bytes')
    assert((await fsp.readFile(path.join(targetAssets, 'aa', 'asset.bin'), 'utf8')) === 'managed asset migration', 'managed asset migration should preserve file content')
    await fsp.writeFile(path.join(sourceAssets, 'aa', 'large.bin'), Buffer.alloc(30, 1))
    const inlineBackup = await exportManagedAssetsForBackup(sourceAssets, { maxFileBytes: 24, totalMaxBytes: 100 })
    assert(inlineBackup.assets.length === 1 && inlineBackup.omitted.length === 1, 'backup should omit assets above its inline size limit')

    const project = service.handle('createProject', {
      workspaceId: 'local-personal',
      name: '测试项目',
      description: 'Repository test',
      tag: '测试',
      tone: 'blue',
    })
    const group = service.handle('createGroup', { projectId: project.id, name: '账号' })
    const renamedGroup = service.handle('updateGroup', { id: group.id, name: '环境账号' })
    assert(renamedGroup.name === '环境账号', 'repository should update group names')
    const entry = service.handle('createEntry', { projectId: project.id, groupId: group.id, type: 'password', title: '环境账号', remark: '' })
    service.handle('updateEntry', {
      id: entry.id,
      passwordItems: [{ id: 'secret-1', name: 'Token', valuePreview: 'plain-secret' }],
    })

    const detail = service.handle('getEntry', { id: entry.id })
    assert(detail.passwordItems[0].valuePreview === 'plain-secret', 'repository should return decrypted password value')

    const rawDb = openRawDb(userData)
    const stored = rawDb.prepare('SELECT value_preview FROM password_entry_items WHERE id = ?').get('secret-1').value_preview
    rawDb.close()
    assert(stored.startsWith('deek-field:v1:'), 'database should store encrypted password field')

    const attachment = service.handle('addAttachment', { projectId: project.id, name: 'hosts', targetType: 'file', target: 'C:\\Windows\\System32\\drivers\\etc\\hosts' })
    assert(service.handle('listAttachments', { projectId: project.id }).length === 1, 'repository should add attachment indexes')
    service.handle('removeAttachment', { id: attachment.id })
    assert(service.handle('listAttachments', { projectId: project.id }).length === 0, 'repository should remove attachment indexes')

    const managedAssetId = `local-${'a'.repeat(64)}`
    const managedAttachment = service.handle('addAttachment', {
      projectId: project.id,
      name: 'managed.txt',
      targetType: 'asset',
      target: `deek-asset://managed-assets/aa/${'a'.repeat(64)}.txt`,
      assetId: managedAssetId,
    })
    assert(service.handle('isAssetReferenced', { id: managedAssetId }), 'managed attachment should keep its asset referenced')
    assert(service.handle('listReferencedAssetIds').includes(managedAssetId), 'repository should enumerate referenced managed assets')

    const quickEntry = service.handle('createQuickEntry', {
      workspaceId: 'local-personal',
      name: 'VS Code',
      targetType: 'file',
      target: 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
      published: true,
    })
    assert(service.handle('listQuickEntries', { workspaceId: 'local-personal' }).length === 1, 'repository should add quick entries')
    const updatedQuickEntry = service.handle('updateQuickEntry', { id: quickEntry.id, published: false })
    assert(updatedQuickEntry && !updatedQuickEntry.published, 'repository should update quick entry status')
    service.handle('deleteQuickEntry', { id: quickEntry.id })
    assert(service.handle('listQuickEntries', { workspaceId: 'local-personal' }).length === 0, 'repository should delete quick entries')

    const cascadeGroup = service.handle('createGroup', { projectId: project.id, name: '临时分组' })
    const cascadeEntry = service.handle('createEntry', { projectId: project.id, groupId: cascadeGroup.id, type: 'text', title: '临时资料', remark: '' })
    service.handle('deleteGroup', { id: cascadeGroup.id })
    assert(!service.handle('getEntry', { id: cascadeEntry.id }), 'deleting a group should delete its entries')
    assert(!service.handle('listGroups', { projectId: project.id }).some((item) => item.id === cascadeGroup.id), 'deleted groups should disappear from listGroups')

    service.setMasterPassword({ password: testPassword, remember: false })
    const locked = service.lock({ forgetRemembered: true })
    assert(locked.locked, 'database should lock after forgetting remembered key')
    let wrongPasswordFailed = false
    try {
      service.unlock({ password: 'wrong-password', remember: false })
    } catch {
      wrongPasswordFailed = true
    }
    assert(wrongPasswordFailed, 'wrong master password should fail')
    service.unlock({ password: testPassword, remember: false })

    const backupPayload = service.handle('exportBackup')
    assert(backupPayload.attachments[0].assetId === managedAssetId, 'backup should preserve managed attachment asset ids')
    const envelope = await createEncryptedBackupEnvelope(JSON.stringify(backupPayload), backupPassword)
    assert(isEncryptedBackupEnvelope(envelope), 'backup should use encrypted envelope')
    let wrongBackupFailed = false
    try {
      await decryptEncryptedBackupEnvelope(envelope, 'wrong-password')
    } catch {
      wrongBackupFailed = true
    }
    assert(wrongBackupFailed, 'wrong backup password should fail')
    const restoredContent = await decryptEncryptedBackupEnvelope(envelope, backupPassword)
    assert(JSON.parse(restoredContent).projects.length === 1, 'backup round-trip should preserve project')
    service.handle('importBackup', { payload: JSON.parse(restoredContent) })
    assert(service.handle('listAttachments', { projectId: project.id })[0].assetId === managedAssetId, 'restore should preserve managed attachment asset ids')
    service.handle('removeAttachment', { id: managedAttachment.id })
    assert(!service.handle('isAssetReferenced', { id: managedAssetId }), 'removed managed attachment should release its asset')
    assert(!service.handle('listReferencedAssetIds').includes(managedAssetId), 'removed managed attachment should leave the referenced asset set')
    service.close()

    console.log('local repository tests passed')
    app.quit()
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
