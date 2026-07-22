const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const Database = require('better-sqlite3-multiple-ciphers')
const { createEncryptedBackupEnvelope, decryptEncryptedBackupEnvelope, isEncryptedBackupEnvelope } = require('../electron/backup-crypto.cjs')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')
const { createAssetStorage, migrateAssetRecords } = require('../electron/asset-storage.cjs')
const { migrateLegacyInlineImages } = require('../electron/legacy-asset-migration.cjs')
const {
  copyManagedAssetsVerified,
  exportManagedAssetsForBackup,
  restoreManagedAssetsMerged,
} = require('../electron/local-asset-files.cjs')

const testPassword = 'deek-test-password'
const backupPassword = 'deek-backup-password'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertThrows(callback, message) {
  let failed = false
  try {
    callback()
  } catch {
    failed = true
  }
  assert(failed, message)
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

async function createFakeS3() {
  const objects = new Map()
  const server = http.createServer(async (request, response) => {
    const parts = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).split('/').filter(Boolean)
    const objectKey = parts.slice(1).join('/')
    if (request.method === 'HEAD' && !objectKey) {
      response.writeHead(200).end()
      return
    }
    if (request.method === 'PUT') {
      const chunks = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      objects.set(objectKey, Buffer.concat(chunks))
      response.writeHead(200, { ETag: '"test-etag"' }).end()
      return
    }
    if (request.method === 'HEAD') {
      const value = objects.get(objectKey)
      if (!value) return response.writeHead(404).end()
      response.writeHead(200, { 'Content-Length': value.length, 'Content-Type': 'application/octet-stream', ETag: '"test-etag"' }).end()
      return
    }
    if (request.method === 'GET') {
      const value = objects.get(objectKey)
      if (!value) return response.writeHead(404).end()
      response.writeHead(200, { 'Content-Length': value.length, 'Content-Type': 'application/octet-stream', ETag: '"test-etag"' }).end(value)
      return
    }
    if (request.method === 'DELETE') {
      objects.delete(objectKey)
      response.writeHead(204).end()
      return
    }
    response.writeHead(405).end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return { endpoint: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve) => server.close(resolve)) }
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
    service.setAssetStorageSettings({
      driver: 's3',
      endpoint: 'http://127.0.0.1:9000',
      region: 'us-east-1',
      bucket: 'deek-test-assets',
      forcePathStyle: true,
      credentials: { accessKey: 'test-access', secretKey: 'test-secret' },
    })
    const publicS3Settings = service.handle('getLocalStorageSettings')
    assert(publicS3Settings.driver === 's3' && publicS3Settings.hasCredentials && !publicS3Settings.credentials, 'renderer storage settings should redact S3 credentials')
    assert(service.getAssetStorageSettings().credentials.secretKey === 'test-secret', 'main process should decrypt S3 credentials from SQLCipher')
    service.setAssetStorageSettings({ driver: 'filesystem', basePath: null })
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

    const restoreAssets = path.join(userData, 'restore-assets')
    await fsp.mkdir(path.join(restoreAssets, 'aa'), { recursive: true })
    await fsp.writeFile(path.join(restoreAssets, 'aa', 'omitted-large.bin'), Buffer.alloc(30, 2))
    await fsp.writeFile(path.join(restoreAssets, 'aa', 'included.txt'), 'old content')
    await restoreManagedAssetsMerged(restoreAssets, [{
      relativePath: 'aa/included.txt',
      contentBase64: Buffer.from('restored content').toString('base64'),
    }])
    assert((await fsp.readFile(path.join(restoreAssets, 'aa', 'included.txt'), 'utf8')) === 'restored content', 'restore should replace files included in the backup')
    assert((await fsp.stat(path.join(restoreAssets, 'aa', 'omitted-large.bin'))).size === 30, 'restore should preserve files omitted from the inline backup')
    let invalidAssetRestoreFailed = false
    try {
      await restoreManagedAssetsMerged(restoreAssets, [{ relativePath: '../outside.bin', contentBase64: 'not-base64' }])
    } catch {
      invalidAssetRestoreFailed = true
    }
    assert(invalidAssetRestoreFailed, 'restore should reject invalid asset paths and content')
    assert((await fsp.readFile(path.join(restoreAssets, 'aa', 'included.txt'), 'utf8')) === 'restored content', 'failed restore should preserve the current asset directory')
    const adapterRoot = path.join(userData, 'asset-storage-adapter')
    const adapter = createAssetStorage({ driver: 'filesystem', rootPath: adapterRoot })
    await adapter.verifyWritable()
    await adapter.putBuffer('bb/asset.txt', Buffer.from('adapter content'))
    assert((await adapter.stat('bb/asset.txt')).size === 15, 'filesystem asset adapter should write and stat content')
    const adapterStored = await adapter.get('bb/asset.txt')
    let adapterContent = ''
    for await (const chunk of adapterStored.body) adapterContent += chunk.toString('utf8')
    assert(adapterContent === 'adapter content', 'filesystem asset adapter should read content')
    const fakeS3 = await createFakeS3()
    try {
      const s3Adapter = createAssetStorage({
        driver: 's3', endpoint: fakeS3.endpoint, region: 'us-east-1', bucket: 'deek-assets', forcePathStyle: true,
        credentials: { accessKey: 'test-access', secretKey: 'test-secret' },
      })
      await s3Adapter.verifyWritable()
      await s3Adapter.putBuffer('cc/s3-asset.txt', Buffer.from('s3 adapter content'))
      assert((await s3Adapter.stat('cc/s3-asset.txt')).size === 18, 'S3 asset adapter should write and stat content')
      const s3Stored = await s3Adapter.get('cc/s3-asset.txt')
      let s3Content = ''
      for await (const chunk of s3Stored.body) s3Content += chunk.toString('utf8')
      assert(s3Content === 's3 adapter content', 'S3 asset adapter should read content')
      const migrationResult = await migrateAssetRecords(adapter, s3Adapter, [{
        objectKey: 'bb/asset.txt', mimeType: 'text/plain', sizeBytes: 15, originalName: 'asset.txt',
      }])
      assert(migrationResult.files === 1 && migrationResult.totalBytes === 15, 'asset migration should copy and verify records across storage drivers')
      const migrated = await s3Adapter.get('bb/asset.txt')
      let migratedContent = ''
      for await (const chunk of migrated.body) migratedContent += chunk.toString('utf8')
      assert(migratedContent === 'adapter content', 'filesystem to S3 migration should preserve bytes')
      await s3Adapter.delete('cc/s3-asset.txt')
    } finally {
      await fakeS3.close()
    }

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
    const otherProject = service.handle('createProject', { workspaceId: 'local-personal', name: '其他项目', description: '', tag: '', tone: 'slate' })
    const otherGroup = service.handle('createGroup', { projectId: otherProject.id, name: '其他分组' })
    assertThrows(() => service.handle('createGroup', { projectId: project.id, parentGroupId: otherGroup.id, name: '非法子分组' }), 'groups should reject cross-project parents')
    assertThrows(() => service.handle('createEntry', { projectId: project.id, groupId: otherGroup.id, type: 'text', title: '非法条目' }), 'entries should reject groups from another project')
    const hierarchyParent = service.handle('createEntry', { projectId: project.id, groupId: group.id, type: 'text', title: '父条目' })
    const hierarchyChild = service.handle('createEntry', { projectId: project.id, groupId: group.id, parentEntryId: hierarchyParent.id, type: 'text', title: '子条目' })
    assertThrows(() => service.handle('updateEntry', { id: hierarchyParent.id, parentEntryId: hierarchyChild.id }), 'entry hierarchy should reject cycles')
    assertThrows(() => service.handle('moveEntry', { entryId: hierarchyChild.id, targetGroupId: otherGroup.id }), 'entries should reject cross-project moves')
    service.handle('deleteProject', { id: otherProject.id })
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
    const managedAsset = service.handle('upsertAsset', {
      id: managedAssetId,
      workspaceId: 'local-personal',
      kind: 'attachment',
      originalName: 'managed.txt',
      mimeType: 'text/plain',
      sizeBytes: 12,
      sha256: 'a'.repeat(64),
      objectKey: `aa/${'a'.repeat(64)}.txt`,
      status: 'ready',
    })
    assert(managedAsset.id === managedAssetId && service.handle('listAssets').length === 1, 'repository should persist unified asset metadata')
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
    const cleanupJob = service.handle('listPendingAssetCleanupJobs')[0]
    assert(cleanupJob && cleanupJob.assetId === managedAssetId, 'releasing the last reference should atomically enqueue retryable cleanup work')
    service.handle('completeAssetCleanup', { jobId: cleanupJob.id, assetId: managedAssetId })
    assert(service.handle('getAsset', { id: managedAssetId }).status === 'deleted', 'completed cleanup should mark asset metadata deleted')

    const inlineImageBytes = Buffer.from('legacy-inline-image')
    const inlineImageDataUrl = `data:image/png;base64,${inlineImageBytes.toString('base64')}`
    const legacyEntry = service.handle('createEntry', {
      projectId: project.id,
      groupId: group.id,
      type: 'text',
      title: '旧正文图片',
    })
    service.handle('updateEntry', {
      id: legacyEntry.id,
      textContent: JSON.stringify({
        format: 'blocknote-json',
        version: 1,
        blocks: [{ type: 'image', props: { url: inlineImageDataUrl } }, { type: 'image', props: { url: inlineImageDataUrl } }],
      }),
    })
    const inlineMigration = await migrateLegacyInlineImages({ database: service, storage: adapter })
    assert(inlineMigration.migratedEntries === 1 && inlineMigration.migratedAssets === 1, 'legacy inline image migration should deduplicate and migrate SQL images')
    const migratedLegacyEntry = service.handle('getEntry', { id: legacyEntry.id })
    assert(!migratedLegacyEntry.textContent.includes('data:image/'), 'legacy inline image migration should remove Base64 data from SQL content')
    assert(migratedLegacyEntry.textContent.match(/deek-asset:\/\/managed-assets\//g)?.length === 2, 'legacy inline image migration should rewrite every image reference')
    const migratedInlineAsset = service.handle('listAssets').find((asset) => asset.sha256 === crypto.createHash('sha256').update(inlineImageBytes).digest('hex'))
    assert(migratedInlineAsset && service.handle('isAssetReferenced', { id: migratedInlineAsset.id }), 'migrated inline image should create referenced asset metadata')
    assert((await adapter.stat(migratedInlineAsset.objectKey)).size === inlineImageBytes.length, 'migrated inline image should persist verified bytes')
    const repeatedMigration = await migrateLegacyInlineImages({ database: service, storage: adapter })
    assert(repeatedMigration.scannedEntries === 0 && repeatedMigration.migratedEntries === 0, 'legacy inline image migration should be idempotent')
    service.close()

    console.log('local repository tests passed')
    app.quit()
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
