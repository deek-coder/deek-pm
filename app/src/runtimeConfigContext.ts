import { createContext, useContext } from 'react'
import type { RepositoryConfig } from './repositories/repositoryFactory'

export type ServiceDeployment = 'cloud' | 'selfhost'

export interface LocalRuntimeConfig {
  kind: 'local'
}

export interface ServerRuntimeConfig {
  kind: 'server'
  baseUrl: string
  deployment: ServiceDeployment
  accessToken: string
  accountEmail: string
}

export type RuntimeConfig = LocalRuntimeConfig | ServerRuntimeConfig

export interface ConnectServiceInput {
  baseUrl: string
  deployment: ServiceDeployment
  email: string
  password: string
}

export interface SavedServiceConnection {
  id: string
  baseUrl: string
  deployment: ServiceDeployment
  accountEmail: string
  instanceName: string
  hasSavedSession: boolean
  createdAt: string
  updatedAt: string
}

export interface RuntimeConfigContextValue {
  config: RuntimeConfig
  repositoryConfig: RepositoryConfig
  savedConnections: SavedServiceConnection[]
  connectService(input: ConnectServiceInput): Promise<void>
  activateSavedService(id: string): Promise<void>
  deleteSavedService(id: string): Promise<void>
  refreshSavedServices(): Promise<void>
  useLocalMode(): void
}

export const RuntimeConfigContext = createContext<RuntimeConfigContextValue | null>(null)

export function useRuntimeConfig() {
  const context = useContext(RuntimeConfigContext)
  if (!context) throw new Error('useRuntimeConfig must be used inside RuntimeConfigProvider')
  return context
}

export const officialServiceUrl = import.meta.env.VITE_OFFICIAL_SERVICE_URL ?? 'https://api.deek.pm'
