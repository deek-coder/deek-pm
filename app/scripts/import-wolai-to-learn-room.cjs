const { app, safeStorage } = require('electron')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

const endpoint = process.env.WOLAI_MCP_ENDPOINT || 'https://api.wolai.com/v1/mcp'
const token = process.env.WOLAI_MCP_TOKEN
const commit = process.argv.includes('--commit')
const projectName = process.env.WOLAI_IMPORT_PROJECT || 'learn-room'
const groupName = process.env.WOLAI_IMPORT_GROUP || 'Wolai 迁移'
const maxPages = Number(process.env.WOLAI_IMPORT_LIMIT || 1000)
const assetRoot = path.join(app.getPath('userData'), 'wolai-assets')
let mcpClient = null

if (!token) {
  console.error('Missing WOLAI_MCP_TOKEN. Set it in the environment before running this script.')
  process.exit(1)
}

async function connectMcp() {
  if (mcpClient) return mcpClient
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
  ])
  const client = new Client({ name: 'deek-pm-wolai-import', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  await client.connect(transport)
  mcpClient = client
  return client
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function invokeWolai(tool, args = {}, retry = 3) {
  let lastError
  for (let attempt = 1; attempt <= retry; attempt += 1) {
    try {
      const client = await connectMcp()
      const result = await client.callTool({ name: tool, arguments: args })
      const contentText = result?.content?.find((item) => item.type === 'text')?.text
      if (!contentText) return result
      return JSON.parse(contentText)
    } catch (error) {
      lastError = error
      if (attempt < retry) await sleep(600 * attempt)
    }
  }
  throw lastError
}

function unwrapData(result) {
  const data = result?.data ?? result
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.pages)) return data.pages
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.list)) return data.list
  return []
}

function normalizePage(raw) {
  const page = raw?.document ?? raw?.page ?? raw
  const id = page?.id ?? page?.page_id ?? page?.block_id
  if (!id) return null
  return {
    id: String(id),
    title: plainText(page.title ?? page.name ?? page.content ?? '未命名页面') || '未命名页面',
    icon: normalizeIcon(page.icon ?? page.page_icon),
    raw: page,
  }
}

function normalizeIcon(icon) {
  if (!icon) return undefined
  if (typeof icon === 'string') return icon.length <= 8 ? icon : undefined
  if (icon.type === 'emoji' && typeof icon.icon === 'string') return icon.icon
  return undefined
}

function plainText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => plainText(item?.title ?? item?.text ?? item?.content ?? item)).join('')
  if (typeof value === 'object') return plainText(value.title ?? value.text ?? value.content ?? value.name ?? '')
  return ''
}

function getBlocks(result) {
  const data = result?.data ?? result
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.blocks)) return data.blocks
  if (Array.isArray(data?.children)) return data.children
  if (Array.isArray(data?.page?.blocks)) return data.page.blocks
  return []
}

async function blockToBlockNote(block, pageId) {
  const type = String(block.type ?? block.block_type ?? '').toLowerCase()
  const content = plainText(block.content ?? block.title ?? block.text ?? block.name)
  const link = plainText(block.media?.download_url ?? block.media?.url ?? block.link ?? block.url ?? block.original_link ?? block.embed_link)
  if (type.includes('heading')) return { type: 'heading', props: { level: clampHeadingLevel(block.level) }, content: content || ' ' }
  if (type.includes('quote')) return { type: 'quote', content: content || ' ' }
  if (type.includes('bull')) return { type: 'bulletListItem', content: content || ' ' }
  if (type.includes('enum')) return { type: 'numberedListItem', content: content || ' ' }
  if (type.includes('todo')) return { type: 'checkListItem', props: { checked: Boolean(block.checked || block.task_status === 'done') }, content: content || ' ' }
  if (type.includes('code')) return { type: 'codeBlock', props: { language: plainText(block.language) || 'text' }, content: content || ' ' }
  if (type.includes('divider')) return { type: 'divider' }
  if (type.includes('image')) {
    const imageUrl = await downloadImageAsset(link, pageId, String(block.id ?? Math.random().toString(36).slice(2)), plainText(block.caption ?? content))
    return imageUrl
      ? {
          type: 'image',
          props: {
            url: imageUrl,
            name: content || 'image',
            caption: plainText(block.caption ?? ''),
            showPreview: true,
            previewWidth: Number(block.dimensions?.width) > 0 ? Math.min(Number(block.dimensions.width), 760) : 520,
          },
        }
      : emptyParagraph(content)
  }
  if (type.includes('video')) return link ? { type: 'video', props: { url: link, name: content || link, caption: content, showPreview: true } } : emptyParagraph(content)
  if (type.includes('audio')) return link ? { type: 'audio', props: { url: link, name: content || link, caption: content, showPreview: true } } : emptyParagraph(content)
  if (type.includes('file') || type.includes('bookmark') || type.includes('embed')) return emptyParagraph(link ? `${content || link}\n${link}` : content)
  if (type.includes('table') && Array.isArray(block.table_content)) return emptyParagraph(tableToMarkdown(block.table_content))
  if (type === 'page' || type.includes('page')) return null
  return emptyParagraph(content)
}

function emptyParagraph(content) {
  return { type: 'paragraph', content: content || ' ' }
}

function clampHeadingLevel(level) {
  const parsed = Number(level ?? 2)
  if (parsed <= 1) return 1
  if (parsed >= 3) return 3
  return 2
}

function serializeBlockNoteBlocks(blocks) {
  return JSON.stringify({
    format: 'blocknote-json',
    version: 1,
    blocks: blocks.length > 0 ? blocks : [{ type: 'paragraph', content: '' }],
  })
}

async function downloadImageAsset(url, pageId, blockId, caption) {
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) return url
  const directory = path.join(assetRoot, pageId)
  const filePath = path.join(directory, `${blockId}${imageExtensionFromUrl(url)}`)
  try {
    await fsp.access(filePath)
    return fileToDataUrl(filePath)
  } catch {
    // Continue with download.
  }
  try {
    await fsp.mkdir(directory, { recursive: true })
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    await fsp.writeFile(filePath, Buffer.from(await response.arrayBuffer()))
    if (caption) await fsp.writeFile(path.join(directory, `${blockId}.txt`), caption, 'utf8')
    return fileToDataUrl(filePath)
  } catch (error) {
    console.error(`Failed to download image ${url.slice(0, 120)}: ${error.message}`)
    return url
  }
}

function imageExtensionFromUrl(url) {
  const downloadName = /[?&]download=([^&]+)/i.exec(url)?.[1]
  const pathname = downloadName ? decodeURIComponent(downloadName) : new URL(url).pathname
  const extension = path.extname(pathname).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'].includes(extension)) return extension
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

function tableToMarkdown(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return ''
  const normalized = rows.map((row) => (Array.isArray(row) ? row : []).map(plainText))
  const width = Math.max(...normalized.map((row) => row.length), 1)
  const padded = normalized.map((row) => [...row, ...Array.from({ length: width - row.length }, () => '')])
  return [
    `| ${padded[0].join(' | ')} |`,
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...padded.slice(1).map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

function extractChildPages(blocks, parentPageId) {
  return blocks
    .filter((block) => String(block.type ?? block.block_type ?? '').toLowerCase().includes('page') && String(block.parent_id ?? '') === parentPageId)
    .map(normalizePage)
    .filter(Boolean)
}

async function loadPage(pageId) {
  const full = await invokeWolai('get_doc', { doc_id: pageId, include_blocks: true })
  let blocks = getBlocks(full)
  if (blocks.length === 0) {
    try {
      blocks = getBlocks(await invokeWolai('get_page_blocks', { page_id: pageId }))
    } catch {
      blocks = []
    }
  }
  const data = full?.data ?? full
  const page = normalizePage(data) ?? blocks.map(normalizePage).find((item) => item?.id === pageId) ?? { id: pageId, title: pageId }
  const contentBlocks = blocks.filter((block) => String(block.id ?? '') !== pageId && String(block.page_id ?? '') === pageId && !String(block.type ?? block.block_type ?? '').toLowerCase().includes('page'))
  return { page, blocks, contentBlocks }
}

function indexImportedEntries(service, projectId) {
  const index = new Map()
  for (const group of service.handle('listGroups', { projectId })) {
    for (const summary of group.entries) {
      const detail = service.handle('getEntry', { id: summary.id })
      const wolaiId = detail?.tags?.find((tag) => tag.startsWith('wolai:'))?.slice('wolai:'.length) ?? detail?.remark?.match(/wolai:([^\s]+)/)?.[1]
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
      description: '从 wolai MCP 迁移的知识库。',
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
  const importedPageIds = new Set()
  const stats = { listed: 0, created: 0, updated: 0, skipped: 0, failed: 0 }

  try {
    const listResults = await Promise.allSettled([
      invokeWolai('list_docs', { limit: maxPages }),
    ])
    const rootPages = listResults
      .flatMap((result) => (result.status === 'fulfilled' ? unwrapData(result.value) : []))
      .map(normalizePage)
      .filter(Boolean)
    const uniqueRootPages = Array.from(new Map(rootPages.map((page) => [page.id, page])).values())
    stats.listed = uniqueRootPages.length

    const { project, group } = ensureProjectAndGroup(service)
    if (!commit) {
      console.log(JSON.stringify({ mode: 'dry-run', projectName, groupName, rootPages: uniqueRootPages.slice(0, 50), stats }, null, 2))
      return
    }
    if (!project || !group) throw new Error('Failed to create target project/group')

    const existingIndex = indexImportedEntries(service, project.id)
    const importPage = async (pageSummary, parentEntryId) => {
      if (!pageSummary?.id || importedPageIds.has(pageSummary.id)) return
      importedPageIds.add(pageSummary.id)
      try {
        const { page, blocks, contentBlocks } = await loadPage(pageSummary.id)
        const blockNoteBlocks = []
        for (const block of contentBlocks) {
          const blockNoteBlock = await blockToBlockNote(block, pageSummary.id)
          if (blockNoteBlock) blockNoteBlocks.push(blockNoteBlock)
        }
        const textContent = serializeBlockNoteBlocks(blockNoteBlocks)
        const title = page.title || pageSummary.title || '未命名页面'
        const icon = page.icon ?? pageSummary.icon
        const existing = existingIndex.get(pageSummary.id)
        let entry
        if (existing) {
          entry = service.handle('updateEntry', {
            id: existing.id,
            title,
            icon: icon ?? null,
            remark: '',
            tags: [`wolai:${pageSummary.id}`],
            textContent,
          })
          stats.updated += 1
        } else {
          entry = service.handle('createEntry', {
            projectId: project.id,
            groupId: group.id,
            parentEntryId,
            type: 'text',
            title,
            icon,
            remark: '',
          })
          service.handle('updateEntry', { id: entry.id, tags: [`wolai:${pageSummary.id}`], textContent })
          existingIndex.set(pageSummary.id, entry)
          stats.created += 1
        }
        await sleep(120)
        for (const child of extractChildPages(blocks, pageSummary.id)) await importPage(child, entry.id)
      } catch (error) {
        stats.failed += 1
        console.error(`Failed to import ${pageSummary.id} ${pageSummary.title}: ${error.message}`)
      }
    }

    for (const page of uniqueRootPages) await importPage(page, undefined)
    console.log(JSON.stringify({ mode: 'commit', project, group, stats }, null, 2))
  } catch (error) {
    console.error(error)
    app.exit(1)
    return
  } finally {
    if (mcpClient) await mcpClient.close()
    service.close()
    app.quit()
  }
})
