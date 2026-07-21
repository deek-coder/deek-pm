const { app, safeStorage } = require('electron')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { fileURLToPath } = require('node:url')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

function isLocalImageUrl(url) {
  return typeof url === 'string' && (url.startsWith('deek-asset://wolai-assets/') || url.startsWith('file:///'))
}

function localPathFromUrl(url) {
  if (url.startsWith('deek-asset://')) {
    const parsed = new URL(url)
    const relativePath = decodeURIComponent(`${parsed.hostname}${parsed.pathname}`)
    return path.join(app.getPath('userData'), relativePath)
  }
  return fileURLToPath(url)
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

async function fileToDataUrl(filePath) {
  const bytes = await fsp.readFile(filePath)
  return `data:${mimeTypeFromExtension(filePath)};base64,${bytes.toString('base64')}`
}

async function migrateContent(value) {
  if (!value || !value.includes('"type":"image"') && !value.includes('"type": "image"')) return { value, changed: false }
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    return { value, changed: false }
  }
  if (parsed.format !== 'blocknote-json' || !Array.isArray(parsed.blocks)) return { value, changed: false }

  let changed = false
  for (const block of parsed.blocks) {
    if (block?.type !== 'image' || !isLocalImageUrl(block.props?.url)) continue
    try {
      block.props.url = await fileToDataUrl(localPathFromUrl(block.props.url))
      changed = true
    } catch (error) {
      console.error(`Failed to inline image ${block.props.url}: ${error.message}`)
    }
  }
  return { value: JSON.stringify(parsed), changed }
}

app.whenReady().then(async () => {
  const service = createLocalDatabaseService({ app, safeStorage })
  let updated = 0
  try {
    const workspaces = service.handle('listWorkspaces')
    for (const workspace of workspaces) {
      for (const project of service.handle('listProjects', { workspaceId: workspace.id })) {
        const groups = service.handle('listGroups', { projectId: project.id })
        for (const summary of groups.flatMap((group) => group.entries)) {
          const entry = service.handle('getEntry', { id: summary.id })
          const result = await migrateContent(entry.textContent ?? '')
          if (!result.changed) continue
          service.handle('updateEntry', { id: entry.id, textContent: result.value })
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
