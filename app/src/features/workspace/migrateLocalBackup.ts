import type { BackupPayload, ManagedAsset, Repositories } from '../../repositories/repository'

export interface MigrationResult {
  projects: number
  entries: number
  assets: number
  attachments: number
  quickEntries: number
  skippedPathAttachments: number
}

export async function migrateLocalBackupToService(
  payload: BackupPayload,
  target: Repositories,
  onProgress?: (message: string) => void,
): Promise<MigrationResult> {
  if ((payload.omittedManagedAssets?.length ?? 0) > 0) {
    throw new Error(`有 ${payload.omittedManagedAssets?.length} 个大文件未内嵌到迁移数据中，请先单独处理这些文件`)
  }
  const workspaces = await target.workspace.listWorkspaces()
  const workspace = workspaces[0]
  if (!workspace) throw new Error('目标服务账号没有可用的个人资料库')

  const createdProjectIds: string[] = []
  const createdAssetIds: string[] = []
  const createdQuickEntryIds: string[] = []
  const assetByRelativePath = new Map<string, ManagedAsset>()
  const result: MigrationResult = { projects: 0, entries: 0, assets: 0, attachments: 0, quickEntries: 0, skippedPathAttachments: 0 }

  try {
    for (const [index, asset] of (payload.managedAssets ?? []).entries()) {
      onProgress?.(`正在上传文件 ${index + 1}/${payload.managedAssets?.length ?? 0}`)
      const attachment = payload.attachments.find((item) => item.target.includes(asset.relativePath))
      const file = base64AssetToFile(asset.contentBase64, attachment?.name ?? asset.relativePath.split('/').at(-1) ?? 'asset.bin')
      const uploaded = await target.asset.uploadAsset({ workspaceId: workspace.id, kind: attachment ? 'attachment' : 'image', file })
      assetByRelativePath.set(asset.relativePath, uploaded)
      createdAssetIds.push(uploaded.id)
      result.assets += 1
    }

    for (const [projectIndex, sourceProject] of payload.projects.entries()) {
      onProgress?.(`正在迁移项目 ${projectIndex + 1}/${payload.projects.length}：${sourceProject.name}`)
      const project = await target.project.createProject({
        workspaceId: workspace.id,
        name: sourceProject.name,
        description: sourceProject.description,
        tag: sourceProject.tag,
        tone: sourceProject.tone,
      })
      createdProjectIds.push(project.id)
      result.projects += 1

      const sourceGroups = payload.knowledgeGroups.filter((group) => group.projectId === sourceProject.id)
      const groupIds = new Map<string, string>()
      await migrateInParentOrder(sourceGroups, (group) => group.id, (group) => group.parentGroupId, async (group) => {
        const created = await target.knowledge.createGroup({
          projectId: project.id,
          name: group.name,
          parentGroupId: group.parentGroupId ? groupIds.get(group.parentGroupId) : undefined,
        })
        groupIds.set(group.id, created.id)
      })

      const sourceEntries = sourceGroups.flatMap((group) => group.entries.map((summary) => ({ summary, detail: payload.entries[summary.id], groupId: group.id })))
      const entryIds = new Map<string, string>()
      await migrateInParentOrder(sourceEntries, (item) => item.summary.id, (item) => item.summary.parentEntryId, async ({ summary, detail, groupId }) => {
        if (!detail) return
        const targetGroupId = groupIds.get(groupId)
        if (!targetGroupId) throw new Error(`无法找到条目“${summary.title}”所属的分组`)
        const created = await target.knowledge.createEntry({
          projectId: project.id,
          groupId: targetGroupId,
          parentEntryId: summary.parentEntryId ? entryIds.get(summary.parentEntryId) : undefined,
          type: detail.type,
          title: detail.title,
          icon: detail.icon,
          remark: detail.remark,
        })
        entryIds.set(summary.id, created.id)
        await target.knowledge.updateEntry({
          id: created.id,
          tags: detail.tags,
          textContent: rewriteManagedAssetUrls(detail.textContent, assetByRelativePath),
          passwordItems: detail.passwordItems,
          linkItems: detail.linkItems,
        })
        result.entries += 1
      })

      for (const attachment of payload.attachments.filter((item) => item.projectId === sourceProject.id)) {
        if (attachment.targetType !== 'asset') {
          result.skippedPathAttachments += 1
          continue
        }
        const migratedAsset = findMigratedAsset(attachment.target, assetByRelativePath)
        if (!migratedAsset) throw new Error(`附件“${attachment.name}”缺少文件本体，无法迁移`)
        await target.attachment.addAttachment({
          projectId: project.id,
          name: attachment.name,
          targetType: 'asset',
          target: migratedAsset.storedUrl,
          assetId: migratedAsset.id,
        })
        result.attachments += 1
      }
    }

    for (const quickEntry of payload.quickEntries ?? []) {
      const created = await target.quickEntry.createQuickEntry({
        workspaceId: workspace.id,
        name: quickEntry.name,
        targetType: quickEntry.targetType,
        target: quickEntry.target,
        published: quickEntry.published,
      })
      createdQuickEntryIds.push(created.id)
      result.quickEntries += 1
    }
    onProgress?.('迁移完成')
    return result
  } catch (error) {
    onProgress?.('迁移失败，正在回滚本次写入')
    await Promise.allSettled(createdQuickEntryIds.map((id) => target.quickEntry.deleteQuickEntry(id)))
    await Promise.allSettled(createdProjectIds.map((id) => target.project.deleteProject(id)))
    await Promise.allSettled(createdAssetIds.map((id) => target.asset.deleteAsset(id)))
    throw error
  }
}

async function migrateInParentOrder<T>(
  items: T[],
  getId: (item: T) => string,
  getParentId: (item: T) => string | undefined,
  migrate: (item: T) => Promise<void>,
) {
  const remaining = [...items]
  const completed = new Set<string>()
  while (remaining.length > 0) {
    const index = remaining.findIndex((item) => !getParentId(item) || completed.has(getParentId(item)!))
    if (index < 0) throw new Error('资料层级存在循环引用，无法迁移')
    const [item] = remaining.splice(index, 1)
    await migrate(item)
    completed.add(getId(item))
  }
}

function base64AssetToFile(contentBase64: string, name: string) {
  const binary = window.atob(contentBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new File([bytes], name, { type: mimeTypeForName(name) })
}

function mimeTypeForName(name: string) {
  const extension = name.split('.').at(-1)?.toLowerCase()
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', pdf: 'application/pdf', txt: 'text/plain' } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream'
}

function findMigratedAsset(storedUrl: string, assets: Map<string, ManagedAsset>) {
  for (const [relativePath, asset] of assets) if (storedUrl.includes(relativePath)) return asset
  return undefined
}

function rewriteManagedAssetUrls(value: string | undefined, assets: Map<string, ManagedAsset>) {
  if (value === undefined) return undefined
  let result = value
  for (const [relativePath, asset] of assets) {
    result = result.split(`deek-asset://managed-assets/${relativePath}`).join(asset.storedUrl)
  }
  return result
}
