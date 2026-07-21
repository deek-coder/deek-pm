const { app, safeStorage } = require('electron')
const path = require('node:path')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

app.whenReady().then(() => {
  const service = createLocalDatabaseService({ app, safeStorage })
  try {
    const project = service.handle('listProjects', { workspaceId: 'local-personal' }).find((item) => item.name === 'learn-room')
    const groups = service.handle('listGroups', { projectId: project.id })
    const entries = groups.flatMap((group) => group.entries).map((summary) => service.handle('getEntry', { id: summary.id }))
    const withRemark = entries.filter((entry) => entry.remark)
    const withImages = entries.filter((entry) => entry.textContent?.includes('"type":"image"') || entry.textContent?.includes('"type": "image"') || entry.textContent?.includes('!['))
    console.log(JSON.stringify({
      total: entries.length,
      withRemark: withRemark.length,
      withImages: withImages.length,
      blockNoteImages: entries.filter((entry) => entry.textContent?.includes('"type":"image"') || entry.textContent?.includes('"type": "image"')).length,
      samples: withImages.slice(0, 5).map((entry) => ({
        title: entry.title,
        remark: entry.remark,
        tags: entry.tags,
        snippet: entry.textContent.slice(0, 420),
      })),
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
