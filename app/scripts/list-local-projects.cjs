const { app, safeStorage } = require('electron')
const path = require('node:path')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

app.whenReady().then(() => {
  const service = createLocalDatabaseService({ app, safeStorage })
  try {
    const workspaces = service.handle('listWorkspaces')
    const projects = workspaces.flatMap((workspace) => service.handle('listProjects', { workspaceId: workspace.id }))
    console.log(JSON.stringify({ workspaces, projects }, null, 2))
  } catch (error) {
    console.error(error)
    app.exit(1)
    return
  } finally {
    service.close()
  }
  app.quit()
})
