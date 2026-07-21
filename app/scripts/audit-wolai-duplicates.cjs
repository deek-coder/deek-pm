const { app, safeStorage } = require('electron')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

const exportRoot = process.env.WOLAI_EXPORT_DIR || process.argv[2] || 'E:\\SDK_PACKAGE2\\frontend_QaqdNl\\QaqdNl'

function pageIdFromFileName(fileName) {
  const baseName = path.basename(fileName, '.md')
  const index = baseName.lastIndexOf('_')
  return index >= 0 ? baseName.slice(index + 1) : baseName
}

function titleFromFileName(fileName) {
  const baseName = path.basename(fileName, '.md')
  const index = baseName.lastIndexOf('_')
  return index >= 0 ? baseName.slice(0, index) : baseName
}

function titleFromMarkdown(markdown, fallback) {
  const match = markdown.match(/^\s*#\s+(.+?)\s*$/m)
  return match?.[1]?.trim() || fallback || '未命名页面'
}

function normalizeTitle(title) {
  return title.trim().replace(/\s+/g, ' ')
}

async function loadExportPages() {
  const pagesDir = path.join(exportRoot, 'pages')
  const fileNames = (await fsp.readdir(pagesDir)).filter((fileName) => fileName.toLowerCase().endsWith('.md'))
  const pages = new Map()
  for (const fileName of fileNames) {
    const markdown = await fsp.readFile(path.join(pagesDir, fileName), 'utf8')
    const id = pageIdFromFileName(fileName)
    pages.set(id, {
      id,
      fileName,
      title: titleFromMarkdown(markdown, titleFromFileName(fileName)),
      size: Buffer.byteLength(markdown, 'utf8'),
    })
  }
  return pages
}

function collectEntries(service) {
  const project = service.handle('listProjects', { workspaceId: 'local-personal' }).find((item) => item.name === 'learn-room')
  if (!project) throw new Error('learn-room not found')
  const entries = []
  for (const group of service.handle('listGroups', { projectId: project.id })) {
    for (const summary of group.entries) {
      const detail = service.handle('getEntry', { id: summary.id })
      entries.push({ ...detail, groupName: group.name })
    }
  }
  return entries
}

app.whenReady().then(async () => {
  const service = createLocalDatabaseService({ app, safeStorage })
  try {
    const exportPages = await loadExportPages()
    const entries = collectEntries(service)
    const wolaiEntries = entries.filter((entry) => entry.tags?.some((tag) => tag.startsWith('wolai:')))
    const byTitle = new Map()
    for (const entry of wolaiEntries) {
      const key = normalizeTitle(entry.title)
      const group = byTitle.get(key) ?? []
      const wolaiId = entry.tags.find((tag) => tag.startsWith('wolai:')).slice('wolai:'.length)
      group.push({
        title: entry.title,
        id: entry.id,
        parentEntryId: entry.parentEntryId,
        wolaiId,
        exportFile: exportPages.get(wolaiId)?.fileName,
        exportSize: exportPages.get(wolaiId)?.size,
      })
      byTitle.set(key, group)
    }

    const duplicateTitleGroups = Array.from(byTitle.values()).filter((items) => items.length > 1)
    const notInExport = wolaiEntries
      .map((entry) => ({ entry, wolaiId: entry.tags.find((tag) => tag.startsWith('wolai:')).slice('wolai:'.length) }))
      .filter((item) => !exportPages.has(item.wolaiId))

    console.log(JSON.stringify({
      exportPages: exportPages.size,
      wolaiEntries: wolaiEntries.length,
      nonWolaiEntries: entries.length - wolaiEntries.length,
      notInExport: notInExport.length,
      duplicateTitleGroups: duplicateTitleGroups.length,
      duplicateEntryCount: duplicateTitleGroups.reduce((sum, items) => sum + items.length, 0),
      notInExportSamples: notInExport.slice(0, 30).map((item) => ({ title: item.entry.title, wolaiId: item.wolaiId })),
      duplicateSamples: duplicateTitleGroups.slice(0, 30),
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
