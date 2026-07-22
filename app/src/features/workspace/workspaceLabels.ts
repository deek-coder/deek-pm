import type { Workspace } from '../../domain/types'

export function workspaceLabel(workspace: Workspace) {
  return workspace.type === 'local' ? '本地' : '服务端'
}

export function deploymentLabel(workspace: Workspace) {
  if (workspace.type === 'local') return '本机存储'
  return workspace.deployment === 'cloud' ? '官方云服务' : '自部署服务'
}

/** Semantic app-icon tone classes — macOS theme overrides these in CSS. */
export function iconTone(workspace: Workspace) {
  if (workspace.type === 'local') return 'deek-app-icon deek-app-icon-local'
  if (workspace.deployment === 'cloud') return 'deek-app-icon deek-app-icon-cloud'
  return 'deek-app-icon deek-app-icon-selfhost'
}

export function connectionIconTone(deployment: 'cloud' | 'selfhost') {
  return deployment === 'cloud' ? 'deek-app-icon deek-app-icon-cloud' : 'deek-app-icon deek-app-icon-selfhost'
}
