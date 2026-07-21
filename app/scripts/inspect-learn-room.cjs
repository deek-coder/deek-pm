const { app, safeStorage } = require('electron')
const path = require('node:path')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

app.whenReady().then(() => {
  const service = createLocalDatabaseService({ app, safeStorage })
  try {
    const project = service.handle('listProjects', { workspaceId: 'local-personal' }).find((item) => item.name === 'learn-room')
    if (!project) throw new Error('learn-room not found')
    const groups = service.handle('listGroups', { projectId: project.id })
    console.log(JSON.stringify({
      project,
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        entries: group.entries.length,
        roots: group.entries.filter((entry) => !entry.parentEntryId).slice(0, 12).map((entry) => ({ id: entry.id, title: entry.title, icon: entry.icon })),
      })),
      totalEntries: groups.reduce((sum, group) => sum + group.entries.length, 0),
    }, null, 2))
  } catch (error) {
    console.error(error)
    app.exit(1)
    return
  } finally {
    service.close()
  }
  app.quit()
})
