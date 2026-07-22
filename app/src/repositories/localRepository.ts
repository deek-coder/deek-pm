import { createMockRepositories } from './mockRepository'
import type { BackupPayload, Repositories, RepositorySource } from './repository'

export interface LocalRepositoryOptions {
  databasePath?: string
}

const createLocalSource = (options: LocalRepositoryOptions): RepositorySource => ({
  kind: 'local',
  label: '本地个人库',
  description: options.databasePath
    ? `连接本机 SQLCipher 加密数据库：${options.databasePath}`
    : '连接本机 SQLCipher 加密数据库，Renderer 通过受控 IPC 调用本地仓储。',
  encrypted: true,
  supportsBackup: true,
})

const webPreviewSource: RepositorySource = {
  ...createLocalSource({}),
  description: 'Web 预览模式无法访问 Electron 本地数据库，当前使用内存数据源模拟本地库。',
}

const autoBackupDirectoryStorageKey = 'deek-pm.auto-backup-dir.v1'
const autoBackupErrorStorageKey = 'deek-pm.auto-backup-error.v1'
const autoBackupPasswordStorageKey = 'deek-pm.auto-backup-password.v1'
const assetCleanupErrorStorageKey = 'deek-pm.asset-cleanup-error.v1'
const autoBackupIntervalMs = 5 * 60 * 1000
let lastAutoBackupAt = 0

export function createLocalRepositories(options: LocalRepositoryOptions = {}): Repositories {
  if (typeof window === 'undefined' || !window.deek?.localRepository) {
    return createMockRepositories({
      source: webPreviewSource,
      workspaceIds: ['local-personal'],
    })
  }

  const request = async <T>(action: string, payload?: unknown): Promise<T> => {
    const result = await window.deek?.localRepository<T>(action, payload)
    if (!result?.ok) throw new Error(result?.error ?? `本地仓储调用失败：${action}`)
    return result.data as T
  }

  const exportBackupWithAssets = async () => {
    const payload = await request<BackupPayload>('exportBackup')
    if (!window.deek?.exportLocalAssets) return payload
    const result = await window.deek.exportLocalAssets()
    if (!result.ok) throw new Error(result.error ?? '本地资产备份失败')
    const serializedPayload = JSON.stringify(payload)
    const managedAssets = (result.data?.assets ?? []).filter((asset) => serializedPayload.includes(asset.relativePath))
    const omittedManagedAssets = (result.data?.omitted ?? []).filter((asset) => serializedPayload.includes(asset.relativePath))
    return { ...payload, managedAssets, omittedManagedAssets }
  }

  const persistAutoBackup = async () => {
    if (!window.deek?.writeEncryptedBackupToDirectory || !window.deek.safeDecryptText) return
    const directory = window.localStorage.getItem(autoBackupDirectoryStorageKey)
    if (!directory) return
    const now = Date.now()
    if (now - lastAutoBackupAt < autoBackupIntervalMs) return
    const encryptedPassword = window.localStorage.getItem(autoBackupPasswordStorageKey)
    if (!encryptedPassword) return
    const password = await window.deek.safeDecryptText(encryptedPassword)
    if (!password) {
      window.localStorage.setItem(autoBackupErrorStorageKey, '自动备份密码无法解密，请重新设置自动备份')
      return
    }
    const payload = await exportBackupWithAssets()
    const result = await window.deek.writeEncryptedBackupToDirectory(directory, JSON.stringify(payload), password)
    if (result.ok) {
      lastAutoBackupAt = now
      window.localStorage.removeItem(autoBackupErrorStorageKey)
      return
    }
    window.localStorage.setItem(autoBackupErrorStorageKey, result.error ?? 'Auto backup failed')
  }

  const persistAutoBackupSafely = async () => {
    await persistAutoBackup().catch((error) => {
      window.localStorage.setItem(autoBackupErrorStorageKey, error instanceof Error ? error.message : 'Auto backup failed')
    })
  }

  const mutate = async <T>(action: string, payload?: unknown): Promise<T> => {
    const data = await request<T>(action, payload)
    await persistAutoBackupSafely()
    return data
  }

  const pruneLocalAssets = async () => {
    if (!window.deek?.pruneLocalAssets) return
    const referencedAssetIds = await request<string[]>('listReferencedAssetIds')
    const result = await window.deek.pruneLocalAssets(referencedAssetIds)
    if (!result.ok) throw new Error(result.error ?? '本地孤立资产清理失败')
  }

  const mutateAndPrune = async <T>(action: string, payload?: unknown): Promise<T> => {
    const data = await mutate<T>(action, payload)
    await pruneLocalAssets()
      .then(() => window.localStorage.removeItem(assetCleanupErrorStorageKey))
      .catch((error) => window.localStorage.setItem(assetCleanupErrorStorageKey, error instanceof Error ? error.message : 'Asset cleanup failed'))
    return data
  }

  return {
    source: createLocalSource(options),
    workspace: {
      listWorkspaces: () => request('listWorkspaces'),
      getWorkspace: (id) => request('getWorkspace', { id }),
    },
    project: {
      listProjects: (workspaceId) => request('listProjects', { workspaceId }),
      getProject: (id) => request('getProject', { id }),
      createProject: (input) => mutate('createProject', input),
      updateProject: (input) => mutate('updateProject', input),
      deleteProject: (id) => mutateAndPrune('deleteProject', { id }),
    },
    knowledge: {
      listGroups: (projectId) => request('listGroups', { projectId }),
      searchEntryIds: (projectId, query) => request('searchEntryIds', { projectId, query }),
      createGroup: (input) => mutate('createGroup', input),
      updateGroup: (id, name) => mutate('updateGroup', { id, name }),
      deleteGroup: (id) => mutateAndPrune('deleteGroup', { id }),
      moveEntry: (entryId, targetGroupId) => mutate('moveEntry', { entryId, targetGroupId }),
      reorderEntry: (entryId, direction) => mutate('reorderEntry', { entryId, direction }),
      getEntry: (id) => request('getEntry', { id }),
      createEntry: (input) => mutate('createEntry', input),
      updateEntry: (input) => input.textContent === undefined ? mutate('updateEntry', input) : mutateAndPrune('updateEntry', input),
      deleteEntry: (id) => mutateAndPrune('deleteEntry', { id }),
    },
    attachment: {
      listAttachments: (projectId) => request('listAttachments', { projectId }),
      addAttachment: (input) => mutate('addAttachment', input),
      removeAttachment: (id) => mutateAndPrune('removeAttachment', { id }),
    },
    quickEntry: {
      listQuickEntries: (workspaceId) => request('listQuickEntries', { workspaceId }),
      createQuickEntry: (input) => mutate('createQuickEntry', input),
      updateQuickEntry: (input) => mutate('updateQuickEntry', input),
      deleteQuickEntry: (id) => mutate('deleteQuickEntry', { id }),
    },
    backup: {
      exportBackup: exportBackupWithAssets,
      importBackup: async (payload) => {
        const previous = await exportBackupWithAssets()
        await request('importBackup', { payload })
        if (payload.managedAssets === undefined || !window.deek?.restoreLocalAssets) {
          await persistAutoBackupSafely()
          return
        }
        const result = await window.deek.restoreLocalAssets(payload.managedAssets)
        if (!result.ok) {
          await request('importBackup', { payload: previous }).catch(() => undefined)
          if (previous.managedAssets && window.deek?.restoreLocalAssets) {
            await window.deek.restoreLocalAssets(previous.managedAssets).catch(() => undefined)
          }
          throw new Error(result.error ?? '本地资产恢复失败，已回滚到恢复前状态')
        }
        await persistAutoBackupSafely()
      },
    },
    asset: {
      uploadAsset: async ({ workspaceId, kind, file }) => {
        if (!window.deek?.importLocalAsset) throw new Error('当前环境无法写入本地资产目录')
        const result = await window.deek.importLocalAsset({
          workspaceId,
          kind,
          name: file.name || `image-${Date.now()}`,
          mimeType: file.type || 'application/octet-stream',
          bytes: await file.arrayBuffer(),
        })
        if (!result.ok || !result.data) throw new Error(result.error ?? '本地资产写入失败')
        return result.data
      },
      uploadAssetPath: async ({ workspaceId, kind, filePath }) => {
        if (!window.deek?.importLocalAssetPath) throw new Error('当前环境无法按路径托管本地文件')
        const result = await window.deek.importLocalAssetPath({ workspaceId, kind, filePath })
        if (!result.ok || !result.data) throw new Error(result.error ?? '本地文件托管失败')
        return result.data
      },
      resolveAssetUrl: async (storedUrl) => storedUrl,
      deleteAsset: async (id) => {
        const referenced = await request<boolean>('isAssetReferenced', { id })
        if (referenced || !window.deek?.deleteLocalAsset) return
        const result = await window.deek.deleteLocalAsset(id)
        if (!result.ok) throw new Error(result.error ?? '本地资产删除失败')
      },
    },
  }
}
