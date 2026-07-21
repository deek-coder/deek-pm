import type { Deployment } from '../domain/types'
import type { BackupPayload, Repositories, RepositorySource } from './repository'

export interface ServerRepositoryOptions {
  baseUrl: string
  deployment: Extract<Deployment, 'cloud' | 'selfhost'>
  accessToken: string
}

interface ApiErrorPayload {
  error?: string
  message?: string
}

export interface ServiceInstance {
  name: string
  deployment: Extract<Deployment, 'cloud' | 'selfhost'>
  version: string
  registrationEnabled: boolean
}

export interface ServiceLoginResult {
  accessToken: string
  user: { id: string; email: string; name: string }
}

export function normalizeServiceUrl(value: string) {
  const url = new URL(value.trim())
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('服务地址只支持 HTTP 或 HTTPS')
  if (url.username || url.password) throw new Error('服务地址不能包含用户名或密码')
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol === 'http:' && !localHost) throw new Error('非本机服务必须使用 HTTPS')
  return url.toString().replace(/\/$/, '')
}

async function publicRequest<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${normalizeServiceUrl(baseUrl)}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as ApiErrorPayload
    throw new Error(payload.error ?? payload.message ?? `服务请求失败（HTTP ${response.status}）`)
  }
  return response.json() as Promise<T>
}

export function getServiceInstance(baseUrl: string) {
  return publicRequest<ServiceInstance>(baseUrl, '/api/v1/instance')
}

export function loginToService(baseUrl: string, email: string, password: string) {
  return publicRequest<ServiceLoginResult>(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function validateServiceAccessToken(baseUrl: string, accessToken: string) {
  return publicRequest<{ id: string; email: string; name: string }>(baseUrl, '/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

export function createServerRepositories(options: ServerRepositoryOptions): Repositories {
  const baseUrl = normalizeServiceUrl(options.baseUrl)
  const source: RepositorySource = {
    kind: 'server',
    label: options.deployment === 'cloud' ? '官方云服务' : '自部署服务',
    description: `通过统一 HTTP API 连接服务端：${baseUrl}`,
    encrypted: true,
    supportsBackup: false,
    serviceUrl: baseUrl,
  }

  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.accessToken}`,
        ...init?.headers,
      },
    })
    if (response.status === 204) return undefined as T
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as ApiErrorPayload
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('deek:service-auth-expired'))
        throw new Error('登录已过期，请重新连接服务')
      }
      throw new Error(payload.error ?? payload.message ?? `服务请求失败（HTTP ${response.status}）`)
    }
    return response.json() as Promise<T>
  }

  const body = (value: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(value) })
  const patch = (value: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(value) })
  const remove: RequestInit = { method: 'DELETE' }
  const unavailableBackup = async (): Promise<BackupPayload> => {
    throw new Error('服务端空间由服务端统一备份，客户端不提供整库导入导出')
  }
  const resolvedAssetUrls = new Map<string, string>()

  return {
    source,
    workspace: {
      listWorkspaces: () => request('/workspaces'),
      getWorkspace: (id) => request(`/workspaces/${encodeURIComponent(id)}`),
    },
    project: {
      listProjects: (workspaceId) => request(`/workspaces/${encodeURIComponent(workspaceId)}/projects`),
      getProject: (id) => request(`/projects/${encodeURIComponent(id)}`),
      createProject: (input) => request('/projects', body(input)),
      updateProject: ({ id, ...input }) => request(`/projects/${encodeURIComponent(id)}`, patch(input)),
      deleteProject: (id) => request(`/projects/${encodeURIComponent(id)}`, remove),
    },
    knowledge: {
      listGroups: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/groups`),
      searchEntryIds: (projectId, query) => request(`/projects/${encodeURIComponent(projectId)}/search?q=${encodeURIComponent(query)}`),
      createGroup: (input) => request('/groups', body(input)),
      updateGroup: (id, name) => request(`/groups/${encodeURIComponent(id)}`, patch({ name })),
      deleteGroup: (id) => request(`/groups/${encodeURIComponent(id)}`, remove),
      moveEntry: (entryId, targetGroupId) => request(`/entries/${encodeURIComponent(entryId)}/move`, body({ targetGroupId })),
      reorderEntry: (entryId, direction) => request(`/entries/${encodeURIComponent(entryId)}/reorder`, body({ direction })),
      getEntry: (id) => request(`/entries/${encodeURIComponent(id)}`),
      createEntry: (input) => request('/entries', body(input)),
      updateEntry: ({ id, ...input }) => request(`/entries/${encodeURIComponent(id)}`, patch(input)),
      deleteEntry: (id) => request(`/entries/${encodeURIComponent(id)}`, remove),
    },
    attachment: {
      listAttachments: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/attachments`),
      addAttachment: (input) => request('/attachments', body(input)),
      removeAttachment: (id) => request(`/attachments/${encodeURIComponent(id)}`, remove),
    },
    quickEntry: {
      listQuickEntries: (workspaceId) => request(`/workspaces/${encodeURIComponent(workspaceId)}/quick-entries`),
      createQuickEntry: (input) => request('/quick-entries', body(input)),
      updateQuickEntry: ({ id, ...input }) => request(`/quick-entries/${encodeURIComponent(id)}`, patch(input)),
      deleteQuickEntry: (id) => request(`/quick-entries/${encodeURIComponent(id)}`, remove),
    },
    backup: {
      exportBackup: unavailableBackup,
      importBackup: async () => { throw new Error('服务端空间不支持从客户端覆盖导入') },
    },
    asset: {
      uploadAsset: async ({ workspaceId, kind, file }) => {
        const formData = new FormData()
        formData.append('file', file, file.name || `asset-${Date.now()}`)
        const response = await fetch(`${baseUrl}/api/v1/assets/upload?workspaceId=${encodeURIComponent(workspaceId)}&kind=${kind}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${options.accessToken}` },
          body: formData,
          signal: AbortSignal.timeout(120_000),
        })
        const payload = await response.json().catch(() => ({})) as ApiErrorPayload & import('./repository').ManagedAsset
        if (!response.ok) throw new Error(payload.error ?? `文件上传失败（HTTP ${response.status}）`)
        return payload
      },
      resolveAssetUrl: async (storedUrl) => {
        if (!storedUrl.startsWith('deek-asset://service/')) return storedUrl
        const cached = resolvedAssetUrls.get(storedUrl)
        if (cached) return cached
        const id = storedUrl.slice('deek-asset://service/'.length)
        const response = await fetch(`${baseUrl}/api/v1/assets/${encodeURIComponent(id)}/content`, {
          headers: { Authorization: `Bearer ${options.accessToken}` },
          signal: AbortSignal.timeout(30_000),
        })
        if (!response.ok) throw new Error(`文件读取失败（HTTP ${response.status}）`)
        const resolved = URL.createObjectURL(await response.blob())
        resolvedAssetUrls.set(storedUrl, resolved)
        return resolved
      },
      deleteAsset: (id) => request(`/assets/${encodeURIComponent(id)}`, remove),
    },
  }
}
