const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const exportRoot = process.env.WOLAI_EXPORT_DIR || positionalArgs[0] || 'E:\\SDK_PACKAGE2\\frontend_QaqdNl\\QaqdNl'
const commit = process.argv.includes('--commit')
const downloadRemoteImages = !process.argv.includes('--skip-remote-images')
const projectName = process.env.WOLAI_IMPORT_PROJECT || 'learn-room'
const groupName = process.env.WOLAI_IMPORT_GROUP || 'Wolai 迁移'
const assetRoot = path.join(app.getPath('userData'), 'wolai-export-assets')

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

const titleIconMap = new Map([
  ['GIS', '🌏'],
  ['blender', '👁️‍🗨️'],
  ['疑难杂症前端', '🤣'],
  ['编写的分享会教程', '🥲'],
  ['部署', '🐳'],
  ['后端', '😅'],
  ['前端', '🌐'],
  ['软件设计师中级', '📘'],
  ['数据表格', '📊'],
  ['个人项目', '🧩'],
  ['无障碍', '♿'],
  ['BOT', '🤖'],
  ['工作日程', '📅'],
  ['LLM', '🧠'],
  ['react-native', '📱'],
  ['Flutter', '🦋'],
  ['Python', '🐍'],
  ['组件库', '🧱'],
  ['后台管理', '🛠️'],
])

function inferPageIcon(title) {
  const normalized = title.trim()
  if (titleIconMap.has(normalized)) return titleIconMap.get(normalized)
  const lower = normalized.toLowerCase()
  if (lower.includes('react') || lower.includes('vue') || lower.includes('vite')) return '⚛️'
  if (lower.includes('typescript') || lower.includes('javascript') || lower.includes('js')) return '🟨'
  if (lower.includes('css') || lower.includes('scss') || lower.includes('less')) return '🎨'
  if (lower.includes('sql') || lower.includes('postgres') || lower.includes('mysql')) return '🗄️'
  if (lower.includes('docker') || lower.includes('nginx')) return '🐳'
  if (lower.includes('java') || lower.includes('jenkins')) return '☕'
  if (lower.includes('python') || lower.includes('flask')) return '🐍'
  if (lower.includes('qgis') || lower.includes('geoserver') || lower.includes('gis') || lower.includes('cesium')) return '🗺️'
  if (lower.includes('ai') || lower.includes('llm')) return '🧠'
  if (lower.includes('rn') || lower.includes('android') || lower.includes('ios')) return '📱'
  if (normalized.includes('新页面')) return '📄'
  return '📄'
}

function extractMarkdownLinks(markdown) {
  const links = []
  const regex = /!?\[([^\]]*)\]\(([^)]+)\)/g
  let match
  while ((match = regex.exec(markdown))) {
    const full = match[0]
    if (full.startsWith('!')) continue
    const target = cleanMarkdownUrl(match[2])
    if (!target.toLowerCase().endsWith('.md')) continue
    links.push({
      title: match[1]?.trim(),
      targetFile: safeDecodeURIComponent(path.basename(target)),
      line: full,
    })
  }
  return links
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

async function loadExportPages() {
  const pagesDir = path.join(exportRoot, 'pages')
  const pageFiles = (await fsp.readdir(pagesDir)).filter((file) => file.toLowerCase().endsWith('.md'))
  const pages = new Map()
  const fileToId = new Map()
  for (const fileName of pageFiles) {
    const id = pageIdFromFileName(fileName)
    const filePath = path.join(pagesDir, fileName)
    const markdown = await fsp.readFile(filePath, 'utf8')
    const page = {
      id,
      fileName,
      filePath,
      title: titleFromMarkdown(markdown, titleFromFileName(fileName)),
      markdown,
      childIds: [],
    }
    pages.set(id, page)
    fileToId.set(fileName, id)
  }

  for (const page of pages.values()) {
    for (const link of extractMarkdownLinks(page.markdown)) {
      const childId = fileToId.get(link.targetFile)
      if (childId && childId !== page.id && !page.childIds.includes(childId)) page.childIds.push(childId)
    }
  }

  const frontendPath = path.join(exportRoot, 'frontend.md')
  const frontend = await fsp.readFile(frontendPath, 'utf8')
  const rootIds = []
  for (const link of extractMarkdownLinks(frontend)) {
    const id = fileToId.get(path.basename(link.targetFile))
    if (id && !rootIds.includes(id)) rootIds.push(id)
  }

  const referenced = new Set(rootIds)
  for (const page of pages.values()) page.childIds.forEach((id) => referenced.add(id))
  for (const id of pages.keys()) {
    if (!referenced.has(id)) rootIds.push(id)
  }

  return { pages, rootIds }
}

function removeChildLinkOnlyLines(markdown, page, pages) {
  const childFiles = new Set(page.childIds.map((id) => pages.get(id)?.fileName).filter(Boolean))
  return markdown
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return true
      const match = trimmed.match(/^\[([^\]]*)\]\(([^)]+)\)$/)
      if (!match) return true
      return !childFiles.has(path.basename(cleanMarkdownUrl(match[2])))
    })
    .join('\n')
}

async function markdownToBlockNote(markdown, page, pages) {
  const content = removeChildLinkOnlyLines(markdown, page, pages)
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let paragraph = []
  let code = []
  let inCode = false
  let codeLanguage = 'text'

  const flushParagraph = () => {
    const text = paragraph.join('\n').trim()
    paragraph = []
    if (text) blocks.push({ type: 'paragraph', content: text })
  }

  const flushCode = () => {
    blocks.push({ type: 'codeBlock', props: { language: codeLanguage || 'text' }, content: code.join('\n') || ' ' })
    code = []
    codeLanguage = 'text'
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const fence = trimmed.match(/^```(\S*)/)
    if (fence) {
      if (inCode) {
        flushCode()
        inCode = false
      } else {
        flushParagraph()
        inCode = true
        codeLanguage = fence[1] || 'text'
      }
      continue
    }
    if (inCode) {
      code.push(line)
      continue
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (image) {
      flushParagraph()
      const rawUrl = cleanMarkdownUrl(image[2])
      const url = await resolveImageUrl(rawUrl, page.id)
      blocks.push({
        type: 'image',
        props: {
          url,
          name: image[1] || path.basename(rawUrl) || 'image',
          caption: image[1] || '',
          showPreview: true,
          previewWidth: 620,
        },
      })
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      blocks.push({ type: 'heading', props: { level: Math.min(heading[1].length, 3) }, content: heading[2].trim() || ' ' })
      continue
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      flushParagraph()
      blocks.push({ type: 'bulletListItem', content: bullet[1].trim() || ' ' })
      continue
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/)
    if (numbered) {
      flushParagraph()
      blocks.push({ type: 'numberedListItem', content: numbered[1].trim() || ' ' })
      continue
    }

    const quote = trimmed.match(/^>\s?(.+)$/)
    if (quote) {
      flushParagraph()
      blocks.push({ type: 'quote', content: quote[1].trim() || ' ' })
      continue
    }

    if (!trimmed) {
      flushParagraph()
      continue
    }
    paragraph.push(line)
  }
  if (inCode) flushCode()
  flushParagraph()
  return serializeBlockNoteBlocks(blocks)
}

async function resolveImageUrl(rawUrl, pageId) {
  if (!rawUrl) return ''
  if (/^https?:\/\//i.test(rawUrl)) {
    if (!downloadRemoteImages) return rawUrl
    return downloadRemoteImage(rawUrl, pageId)
  }
  const normalized = rawUrl.replaceAll('/', path.sep)
  const absolute = path.resolve(path.join(exportRoot, 'pages'), normalized)
  if (!absolute.startsWith(path.resolve(exportRoot))) return rawUrl
  if (!fs.existsSync(absolute)) return rawUrl
  return fileToDataUrl(absolute)
}

async function downloadRemoteImage(url, pageId) {
  const dir = path.join(assetRoot, pageId)
  const filePath = path.join(dir, `${hashText(url)}${imageExtensionFromUrl(url)}`)
  try {
    await fsp.access(filePath)
    return fileToDataUrl(filePath)
  } catch {
    // Continue with download.
  }
  try {
    await fsp.mkdir(dir, { recursive: true })
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    await fsp.writeFile(filePath, Buffer.from(await response.arrayBuffer()))
    return fileToDataUrl(filePath)
  } catch (error) {
    console.error(`Failed to download image ${url.slice(0, 120)}: ${error.message}`)
    return url
  }
}

function hashText(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return (hash >>> 0).toString(16)
}

function imageExtensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname
    const extension = path.extname(pathname).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'].includes(extension)) return extension
  } catch {
    // Fall through.
  }
  return '.png'
}

async function fileToDataUrl(filePath) {
  const bytes = await fsp.readFile(filePath)
  return `data:${mimeTypeFromExtension(filePath)};base64,${bytes.toString('base64')}`
}

function mimeTypeFromExtension(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.gif') return 'image/gif'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.svg') return 'image/svg+xml'
  if (extension === '.bmp') return 'image/bmp'
  return 'image/png'
}

function serializeBlockNoteBlocks(blocks) {
  return JSON.stringify({
    format: 'blocknote-json',
    version: 1,
    blocks: blocks.length > 0 ? blocks : [{ type: 'paragraph', content: '' }],
  })
}

function indexImportedEntries(service, projectId) {
  const index = new Map()
  for (const group of service.handle('listGroups', { projectId })) {
    for (const summary of group.entries) {
      const detail = service.handle('getEntry', { id: summary.id })
      const wolaiId = detail?.tags?.find((tag) => tag.startsWith('wolai:'))?.slice('wolai:'.length)
      if (wolaiId) index.set(wolaiId, detail)
    }
  }
  return index
}

function ensureProjectAndGroup(service) {
  const workspaceId = 'local-personal'
  let project = service.handle('listProjects', { workspaceId }).find((item) => item.name === projectName)
  if (!project && commit) {
    project = service.handle('createProject', {
      workspaceId,
      name: projectName,
      description: '从 wolai 本地导出迁移的知识库。',
      tag: 'Wolai',
      tone: 'blue',
    })
  }
  if (!project) return { project: null, group: null }
  let group = service.handle('listGroups', { projectId: project.id }).find((item) => item.name === groupName)
  if (!group && commit) group = service.handle('createGroup', { projectId: project.id, name: groupName })
  return { project, group }
}

app.whenReady().then(async () => {
  const service = createLocalDatabaseService({ app, safeStorage })
  const stats = { exportPages: 0, roots: 0, created: 0, updated: 0, failed: 0, images: 0 }

  try {
    const { pages, rootIds } = await loadExportPages()
    stats.exportPages = pages.size
    stats.roots = rootIds.length
    stats.images = (await fsp.readdir(path.join(exportRoot, 'image')).catch(() => [])).length

    const { project, group } = ensureProjectAndGroup(service)
    if (!commit) {
      console.log(JSON.stringify({
        mode: 'dry-run',
        exportRoot,
        projectName,
        groupName,
        stats,
        rootTitles: rootIds.slice(0, 40).map((id) => pages.get(id)?.title),
      }, null, 2))
      return
    }
    if (!project || !group) throw new Error('Failed to create target project/group')

    const existingIndex = indexImportedEntries(service, project.id)
    const imported = new Set()
    const importPage = async (pageId, parentEntryId) => {
      if (imported.has(pageId)) return existingIndex.get(pageId)
      imported.add(pageId)
      const page = pages.get(pageId)
      if (!page) return undefined
      try {
        const textContent = await markdownToBlockNote(page.markdown, page, pages)
        const existing = existingIndex.get(pageId)
        let entry
        if (existing) {
          entry = service.handle('updateEntry', {
            id: existing.id,
            parentEntryId: parentEntryId ?? null,
            title: page.title,
            icon: existing.icon ?? inferPageIcon(page.title),
            remark: '',
            tags: [`wolai:${pageId}`],
            textContent,
          })
          stats.updated += 1
        } else {
          entry = service.handle('createEntry', {
            projectId: project.id,
            groupId: group.id,
            parentEntryId,
            type: 'text',
            title: page.title,
            icon: inferPageIcon(page.title),
            remark: '',
          })
          entry = service.handle('updateEntry', { id: entry.id, tags: [`wolai:${pageId}`], textContent })
          existingIndex.set(pageId, entry)
          stats.created += 1
        }
        for (const childId of page.childIds) await importPage(childId, entry.id)
        return entry
      } catch (error) {
        stats.failed += 1
        console.error(`Failed to import ${page.fileName}: ${error.message}`)
        return undefined
      }
    }

    for (const rootId of rootIds) await importPage(rootId, undefined)
    for (const pageId of pages.keys()) await importPage(pageId, undefined)

    console.log(JSON.stringify({ mode: 'commit', exportRoot, projectId: project.id, groupId: group.id, stats }, null, 2))
  } catch (error) {
    console.error(error)
    app.exit(1)
    return
  } finally {
    service.close()
    app.quit()
  }
})
