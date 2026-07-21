const { app, safeStorage } = require('electron')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

const exportRoot = process.env.WOLAI_EXPORT_DIR || process.argv[2] || 'E:\\SDK_PACKAGE2\\frontend_QaqdNl\\QaqdNl'
const projectName = process.env.WOLAI_IMPORT_PROJECT || 'learn-room'

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

function cleanMarkdownUrl(raw) {
  const value = raw.trim()
  if (value.startsWith('<')) {
    const endIndex = value.indexOf('>')
    if (endIndex > 0) return value.slice(1, endIndex).trim()
  }
  if (!value.includes('"')) return value
  return value.slice(0, value.indexOf('"')).trim().replace(/^<|>$/g, '')
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function extractPageLinks(markdown) {
  const links = []
  const regex = /!?\[([^\]]*)\]\(([^)]+)\)/g
  let match
  while ((match = regex.exec(markdown))) {
    if (match[0].startsWith('!')) continue
    const target = cleanMarkdownUrl(match[2])
    if (!target.toLowerCase().endsWith('.md')) continue
    links.push(safeDecodeURIComponent(path.basename(target)))
  }
  return links
}

async function loadExportGraph() {
  const pagesDir = path.join(exportRoot, 'pages')
  const fileNames = (await fsp.readdir(pagesDir)).filter((fileName) => fileName.toLowerCase().endsWith('.md'))
  const fileToId = new Map()
  const pages = new Map()
  for (const fileName of fileNames) {
    const id = pageIdFromFileName(fileName)
    const markdown = await fsp.readFile(path.join(pagesDir, fileName), 'utf8')
    fileToId.set(fileName, id)
    pages.set(id, { id, fileName, title: titleFromMarkdown(markdown, titleFromFileName(fileName)), markdown })
  }

  const childToParents = new Map()
  for (const page of pages.values()) {
    for (const fileName of extractPageLinks(page.markdown)) {
      const childId = fileToId.get(fileName)
      if (!childId || childId === page.id) continue
      const parents = childToParents.get(childId) ?? []
      parents.push(page.id)
      childToParents.set(childId, parents)
    }
  }

  const frontend = await fsp.readFile(path.join(exportRoot, 'frontend.md'), 'utf8')
  const rootIds = new Set(extractPageLinks(frontend).map((fileName) => fileToId.get(fileName)).filter(Boolean))
  return { pages, rootIds, childToParents }
}

function indexEntries(service, projectId) {
  const entries = []
  for (const group of service.handle('listGroups', { projectId })) {
    for (const summary of group.entries) entries.push(service.handle('getEntry', { id: summary.id }))
  }
  const byWolaiId = new Map()
  for (const entry of entries) {
    const wolaiId = entry.tags?.find((tag) => tag.startsWith('wolai:'))?.slice('wolai:'.length)
    if (wolaiId) byWolaiId.set(wolaiId, entry)
  }
  return byWolaiId
}

app.whenReady().then(async () => {
  const service = createLocalDatabaseService({ app, safeStorage })
  try {
    const { pages, rootIds, childToParents } = await loadExportGraph()
    const project = service.handle('listProjects', { workspaceId: 'local-personal' }).find((item) => item.name === projectName)
    if (!project) throw new Error(`${projectName} not found`)
    const entries = indexEntries(service, project.id)
    const mismatches = []
    const ambiguous = []
    const missing = []
    const rootsInDb = []

    for (const [pageId, page] of pages) {
      const entry = entries.get(pageId)
      if (!entry) {
        missing.push({ title: page.title, pageId })
        continue
      }
      const parentIds = childToParents.get(pageId) ?? []
      if (parentIds.length > 1) {
        ambiguous.push({ title: page.title, pageId, parents: parentIds.map((id) => pages.get(id)?.title || id) })
        continue
      }
      const expectedParentPageId = rootIds.has(pageId) ? undefined : parentIds[0]
      const expectedParentEntryId = expectedParentPageId ? entries.get(expectedParentPageId)?.id : undefined
      if (!expectedParentEntryId && !entry.parentEntryId) {
        rootsInDb.push(page.title)
        continue
      }
      if ((entry.parentEntryId || '') !== (expectedParentEntryId || '')) {
        mismatches.push({
          title: page.title,
          pageId,
          expectedParent: expectedParentPageId ? pages.get(expectedParentPageId)?.title || expectedParentPageId : '(root)',
          actualParentEntryId: entry.parentEntryId || '(root)',
        })
      }
    }

    console.log(JSON.stringify({
      exportPages: pages.size,
      importedPages: entries.size,
      rootsFromFrontend: rootIds.size,
      rootsInDb: rootsInDb.length,
      missing: missing.length,
      mismatches: mismatches.length,
      ambiguous: ambiguous.length,
      mismatchSamples: mismatches.slice(0, 30),
      ambiguousSamples: ambiguous.slice(0, 20),
      missingSamples: missing.slice(0, 20),
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
