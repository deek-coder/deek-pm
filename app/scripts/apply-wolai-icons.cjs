const { app, safeStorage } = require('electron')
const path = require('node:path')
const { createLocalDatabaseService } = require('../electron/local-database.cjs')

app.setPath('userData', path.join(app.getPath('appData'), 'deek-pm-app'))

const commit = process.argv.includes('--commit')
const projectName = process.env.WOLAI_IMPORT_PROJECT || 'learn-room'

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

app.whenReady().then(() => {
  const service = createLocalDatabaseService({ app, safeStorage })
  try {
    const project = service.handle('listProjects', { workspaceId: 'local-personal' }).find((item) => item.name === projectName)
    if (!project) throw new Error(`${projectName} not found`)
    const groups = service.handle('listGroups', { projectId: project.id })
    const updates = []
    for (const group of groups) {
      for (const summary of group.entries) {
        const detail = service.handle('getEntry', { id: summary.id })
        const isWolai = detail.tags?.some((tag) => tag.startsWith('wolai:'))
        if (!isWolai) continue
        const icon = inferPageIcon(detail.title)
        if (detail.icon === icon) continue
        updates.push({ id: detail.id, title: detail.title, from: detail.icon ?? null, to: icon })
        if (commit) service.handle('updateEntry', { id: detail.id, icon })
      }
    }
    console.log(JSON.stringify({
      mode: commit ? 'commit' : 'dry-run',
      updates: updates.length,
      samples: updates.slice(0, 40),
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
