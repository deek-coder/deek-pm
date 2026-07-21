const { app, safeStorage } = require('electron')
const crypto = require('node:crypto')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const exportRoot = process.env.WOLAI_EXPORT_DIR || positionalArgs[0] || 'E:\\SDK_PACKAGE2\\frontend_QaqdNl\\QaqdNl'
const commit = process.argv.includes('--commit')

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

function normalizeTitle(value) {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeMarkdown(value) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function hashText(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
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
      contentHash: hashText(normalizeMarkdown(markdown)),
      normalizedSize: normalizeMarkdown(markdown).length,
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
      const wolaiId = detail.tags?.find((tag) => tag.startsWith('wolai:'))?.slice('wolai:'.length)
      entries.push({ ...detail, groupId: group.id, groupName: group.name, wolaiId })
    }
  }
  return entries
}

function buildChildrenByParent(entries) {
  const childrenByParent = new Map()
  for (const entry of entries) {
    if (!entry.parentEntryId) continue
    const children = childrenByParent.get(entry.parentEntryId) ?? []
    children.push(entry.id)
    childrenByParent.set(entry.parentEntryId, children)
  }
  return childrenByParent
}

app.whenReady().then(async () => {
  const service = createLocalDatabaseService({ app, safeStorage })
  try {
    const exportPages = await loadExportPages()
    const entries = collectEntries(service)
    const childrenByParent = buildChildrenByParent(entries)
    const groups = new Map()
    for (const entry of entries) {
      if (!entry.wolaiId || !exportPages.has(entry.wolaiId)) continue
      const page = exportPages.get(entry.wolaiId)
      const key = `${normalizeTitle(page.title)}\n${page.contentHash}`
      const group = groups.get(key) ?? []
      group.push({
        entryId: entry.id,
        title: entry.title,
        parentEntryId: entry.parentEntryId,
        wolaiId: entry.wolaiId,
        fileName: page.fileName,
        normalizedSize: page.normalizedSize,
        hasChildren: (childrenByParent.get(entry.id) ?? []).length > 0,
      })
      groups.set(key, group)
    }

    const toDelete = []
    const skippedWithChildren = []
    for (const items of groups.values()) {
      if (items.length <= 1) continue
      const keep = items.find((item) => item.hasChildren) ?? items[0]
      for (const item of items) {
        if (item.entryId === keep.entryId) continue
        if (item.hasChildren) {
          skippedWithChildren.push(item)
          continue
        }
        toDelete.push({ ...item, keptEntryId: keep.entryId, keptWolaiId: keep.wolaiId })
      }
    }

    if (commit) {
      for (const item of toDelete) service.handle('deleteEntry', { id: item.entryId })
    }

    console.log(JSON.stringify({
      mode: commit ? 'commit' : 'dry-run',
      duplicateLeaves: toDelete.length,
      skippedWithChildren: skippedWithChildren.length,
      samples: toDelete.slice(0, 60),
      skippedSamples: skippedWithChildren.slice(0, 20),
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
