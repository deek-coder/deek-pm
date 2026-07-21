const { app, safeStorage } = require('electron')
const path = require('node:path')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

const commit = process.argv.includes('--commit')

app.whenReady().then(() => {
  const service = createLocalDatabaseService({ app, safeStorage })
  try {
    const project = service.handle('listProjects', { workspaceId: 'local-personal' }).find((item) => item.name === 'learn-room')
    if (!project) throw new Error('learn-room not found')
    const groups = service.handle('listGroups', { projectId: project.id })
    const deletedEntries = []
    const deletedGroups = []

    for (const group of groups) {
      for (const summary of group.entries) {
        const detail = service.handle('getEntry', { id: summary.id })
        const isWolai = detail.tags?.some((tag) => tag.startsWith('wolai:'))
        if (isWolai) continue
        deletedEntries.push({ id: detail.id, title: detail.title, groupName: group.name })
        if (commit) service.handle('deleteEntry', { id: detail.id })
      }
    }

    if (commit) {
      for (const group of service.handle('listGroups', { projectId: project.id })) {
        if (group.entries.length > 0) continue
        deletedGroups.push({ id: group.id, name: group.name })
        service.handle('deleteGroup', { id: group.id })
      }
    } else {
      for (const group of groups) {
        const allDeleted = group.entries.length > 0 && group.entries.every((entry) => deletedEntries.some((deleted) => deleted.id === entry.id))
        if (allDeleted) deletedGroups.push({ id: group.id, name: group.name })
      }
    }

    console.log(JSON.stringify({
      mode: commit ? 'commit' : 'dry-run',
      deletedEntries,
      deletedGroups,
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
