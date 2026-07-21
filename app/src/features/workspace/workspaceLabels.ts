import type { Workspace } from '../../domain/types'

export function workspaceLabel(workspace: Workspace) {
  return workspace.type === 'local' ? '本地' : '服务端'
}

export function deploymentLabel(workspace: Workspace) {
  if (workspace.type === 'local') return '本机存储'
  return workspace.deployment === 'cloud' ? '官方云服务' : '自部署服务'
}

export function iconTone(workspace: Workspace) {
  if (workspace.type === 'local') return 'bg-slate-950'
  if (workspace.deployment === 'cloud') return 'bg-slate-800'
  return 'bg-slate-700'
}
