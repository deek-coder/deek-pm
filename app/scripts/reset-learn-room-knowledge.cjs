const { app, safeStorage } = require('electron')
const path = require('node:path')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

const commit = process.argv.includes('--commit')
const projectName = process.env.WOLAI_IMPORT_PROJECT || 'learn-room'

app.whenReady().then(() => {
  const service = createLocalDatabaseService({ app, safeStorage })
  try {
    const project = service.handle('listProjects', { workspaceId: 'local-personal' }).find((item) => item.name === projectName)
    if (!project) throw new Error(`${projectName} not found`)
    const groups = service.handle('listGroups', { projectId: project.id })
    const deletedGroups = groups.map((group) => ({ id: group.id, name: group.name, entries: group.entries.length }))

    if (commit) {
      for (const group of groups) service.handle('deleteGroup', { id: group.id })
    }

    console.log(JSON.stringify({
      mode: commit ? 'commit' : 'dry-run',
      projectId: project.id,
      deletedGroups,
      deletedEntries: deletedGroups.reduce((sum, group) => sum + group.entries, 0),
    }, null, 2))
  } catch (error) {
    console.error(error)
    app.exit(1)
    return
  } finally {
    service.close()
    app.quit()
  }
})
