import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getServiceInstance, loginToService, normalizeServiceUrl, validateServiceAccessToken } from './repositories/serverRepository'
import {
  RuntimeConfigContext,
  type RuntimeConfig,
  type RuntimeConfigContextValue,
  type ServerRuntimeConfig,
  type SavedServiceConnection,
  type ServiceDeployment,
} from './runtimeConfigContext'

const storageKey = 'deek-pm.runtime-config.v1'

interface StoredServiceConfig {
  kind: 'server'
  baseUrl: string
  deployment: ServiceDeployment
  encryptedAccessToken: string
  accountEmail: string
}

const defaultConfig: RuntimeConfig = { kind: 'local' }

interface StoredSavedServiceConnection extends SavedServiceConnection {
  encryptedAccessToken?: string | null
}

async function localRepositoryRequest<T>(action: string, payload?: unknown): Promise<T> {
  if (!window.deek?.localRepository) throw new Error('当前环境无法访问本地连接配置')
  const result = await window.deek.localRepository<T>(action, payload)
  if (!result.ok) throw new Error(result.error ?? '本地连接配置操作失败')
  return result.data as T
}

async function encryptAccessToken(accessToken: string) {
  const encrypted = await window.deek?.safeEncryptText?.(accessToken)
  return encrypted ? `safe:${encrypted}` : null
}

async function decryptAccessToken(value: string) {
  if (value.startsWith('safe:')) return window.deek?.safeDecryptText?.(value.slice(5)) ?? null
  return null
}

async function readRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return defaultConfig
    const stored = JSON.parse(raw) as StoredServiceConfig
    if (stored.kind !== 'server' || !stored.baseUrl || !stored.encryptedAccessToken) return defaultConfig
    const accessToken = await decryptAccessToken(stored.encryptedAccessToken)
    if (!accessToken) return defaultConfig
    return {
      kind: 'server',
      baseUrl: normalizeServiceUrl(stored.baseUrl, stored.deployment === 'selfhost'),
      deployment: stored.deployment,
      accessToken,
      accountEmail: stored.accountEmail,
    }
  } catch {
    return defaultConfig
  }
}

function readStoredServiceConfig() {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const stored = JSON.parse(raw) as StoredServiceConfig
    return stored.kind === 'server' && stored.baseUrl && stored.accountEmail ? stored : null
  } catch {
    return null
  }
}

export function RuntimeConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RuntimeConfig | null>(null)
  const [savedConnections, setSavedConnections] = useState<SavedServiceConnection[]>([])

  const refreshSavedServices = useCallback(async () => {
    if (!window.deek?.localRepository) {
      setSavedConnections([])
      return
    }
    try {
      setSavedConnections(await localRepositoryRequest<SavedServiceConnection[]>('listSavedServiceConnections'))
    } catch {
      setSavedConnections([])
    }
  }, [])

  useEffect(() => {
    void readRuntimeConfig().then(async (nextConfig) => {
      setConfig(nextConfig)
      const stored = readStoredServiceConfig()
      if (nextConfig.kind === 'server' && stored) {
        await localRepositoryRequest('saveServiceConnection', {
          baseUrl: nextConfig.baseUrl,
          deployment: nextConfig.deployment,
          accountEmail: nextConfig.accountEmail,
          instanceName: nextConfig.baseUrl,
          encryptedAccessToken: stored.encryptedAccessToken,
        }).catch(() => undefined)
        await refreshSavedServices()
      }
    })
    void localRepositoryRequest<SavedServiceConnection[]>('listSavedServiceConnections').then(setSavedConnections).catch(() => setSavedConnections([]))
  }, [refreshSavedServices])

  useEffect(() => {
    const expireSession = () => {
      window.localStorage.removeItem(storageKey)
      setConfig(defaultConfig)
      window.location.hash = '#/'
    }
    window.addEventListener('deek:service-auth-expired', expireSession)
    return () => window.removeEventListener('deek:service-auth-expired', expireSession)
  }, [])

  const value = useMemo<RuntimeConfigContextValue | null>(() => {
    if (!config) return null
    return {
      config,
      savedConnections,
      repositoryConfig: config.kind === 'local'
        ? { kind: 'local' }
        : { kind: 'server', baseUrl: config.baseUrl, deployment: config.deployment, accessToken: config.accessToken },
      connectService: async (input) => {
        const allowInsecureRemote = input.deployment === 'selfhost'
        const baseUrl = normalizeServiceUrl(input.baseUrl, allowInsecureRemote)
        const instance = await getServiceInstance(baseUrl, allowInsecureRemote)
        if (input.deployment === 'cloud' && instance.deployment !== 'cloud') {
          throw new Error('该地址不是官方云服务实例，请选择“自部署服务”')
        }
        const login = await loginToService(baseUrl, input.email, input.password, allowInsecureRemote)
        const nextConfig: ServerRuntimeConfig = {
          kind: 'server',
          baseUrl,
          deployment: instance.deployment,
          accessToken: login.accessToken,
          accountEmail: login.user.email,
        }
        const encryptedAccessToken = await encryptAccessToken(login.accessToken)
        await localRepositoryRequest('saveServiceConnection', {
          baseUrl,
          deployment: instance.deployment,
          accountEmail: login.user.email,
          instanceName: instance.name,
          encryptedAccessToken,
        })
        if (encryptedAccessToken) {
          const stored: StoredServiceConfig = {
            kind: 'server',
            baseUrl,
            deployment: instance.deployment,
            encryptedAccessToken,
            accountEmail: login.user.email,
          }
          window.localStorage.setItem(storageKey, JSON.stringify(stored))
        } else {
          window.localStorage.removeItem(storageKey)
        }
        setConfig(nextConfig)
        await refreshSavedServices()
      },
      activateSavedService: async (id) => {
        const saved = await localRepositoryRequest<StoredSavedServiceConnection | undefined>('getSavedServiceConnection', { id })
        if (!saved) throw new Error('已保存的服务连接不存在')
        if (!saved.encryptedAccessToken) throw new Error('该连接没有可复用的登录会话，请重新输入密码')
        const accessToken = await decryptAccessToken(saved.encryptedAccessToken)
        if (!accessToken) throw new Error('登录会话无法解密，请重新输入密码')
        try {
          await validateServiceAccessToken(saved.baseUrl, accessToken, saved.deployment === 'selfhost')
        } catch {
          throw new Error('登录已过期，请重新输入密码')
        }
        const nextConfig: ServerRuntimeConfig = {
          kind: 'server',
          baseUrl: normalizeServiceUrl(saved.baseUrl, saved.deployment === 'selfhost'),
          deployment: saved.deployment,
          accessToken,
          accountEmail: saved.accountEmail,
        }
        window.localStorage.setItem(storageKey, JSON.stringify({
          kind: 'server',
          baseUrl: nextConfig.baseUrl,
          deployment: nextConfig.deployment,
          encryptedAccessToken: saved.encryptedAccessToken,
          accountEmail: nextConfig.accountEmail,
        } satisfies StoredServiceConfig))
        setConfig(nextConfig)
      },
      deleteSavedService: async (id) => {
        const saved = savedConnections.find((item) => item.id === id)
        await localRepositoryRequest('deleteSavedServiceConnection', { id })
        if (saved && config.kind === 'server' && saved.baseUrl === config.baseUrl && saved.accountEmail === config.accountEmail) {
          window.localStorage.removeItem(storageKey)
          setConfig(defaultConfig)
        }
        await refreshSavedServices()
      },
      refreshSavedServices,
      // 只切换当前会话视图；已保存连接写在本地 SQLCipher，不得在此删除。
      useLocalMode: () => {
        window.localStorage.removeItem(storageKey)
        setConfig(defaultConfig)
      },
    }
  }, [config, refreshSavedServices, savedConnections])

  if (!value) {
    return <main className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">正在读取运行配置…</main>
  }

  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>
}
