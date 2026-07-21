const { app, safeStorage } = require('electron')
const path = require('node:path')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

function migrateUrl(value) {
  const userDataUrlPrefix = `file:///${app.getPath('userData').replace(/\\/g, '/')}/`
  return value.split(userDataUrlPrefix).join('deek-asset://')
}

app.whenReady().then(() => {
  const service = createLocalDatabaseService({ app, safeStorage })
  let updated = 0
  try {
    const workspaces = service.handle('listWorkspaces')
    for (const workspace of workspaces) {
      const projects = service.handle('listProjects', { workspaceId: workspace.id })
      for (const project of projects) {
        const groups = service.handle('listGroups', { projectId: project.id })
        for (const summary of groups.flatMap((group) => group.entries)) {
          const entry = service.handle('getEntry', { id: summary.id })
          if (!entry?.textContent?.includes('file:///')) continue
          const nextTextContent = migrateUrl(entry.textContent)
          if (nextTextContent === entry.textContent) continue
          service.handle('updateEntry', { id: entry.id, textContent: nextTextContent })
          updated += 1
        }
      }
    }
    console.log(JSON.stringify({ updated }, null, 2))
  } catch (error) {
    console.error(error)
    app.exit(1)
    return
  } finally {
    service.close()
  }
  app.quit()
})
