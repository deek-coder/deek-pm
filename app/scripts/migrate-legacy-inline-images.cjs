const { app, safeStorage } = require('electron')
const path = require('node:path')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')
const { createAssetStorage } = require('../electron/asset-storage.cjs')
const { migrateLegacyInlineImages } = require('../electron/legacy-asset-migration.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

function runtimeStorageSettings(settings) {
  if (settings.driver === 's3') return settings
  const rootPath = settings.basePath === null
    ? path.join(app.getPath('userData'), 'managed-assets')
    : path.join(path.resolve(settings.basePath), 'deek-pm-assets')
  return { driver: 'filesystem', rootPath }
}

app.whenReady().then(async () => {
  const database = createLocalDatabaseService({ app, safeStorage })
  try {
    const settings = database.getAssetStorageSettings()
    const storage = createAssetStorage(runtimeStorageSettings(settings))
    await storage.ensureReady()
    const result = await migrateLegacyInlineImages({ database, storage })
    console.log(JSON.stringify(result, null, 2))
    if (result.failedEntries > 0) app.exitCode = 2
  } catch (error) {
    console.error(error && error.message ? error.message : error)
    app.exitCode = 1
  } finally {
    database.close()
  }
  app.quit()
})
