import { useMemo, type ReactNode } from 'react'
import type { Repositories } from './repository'
import { createRepositories, defaultRepositoryConfig, type RepositoryConfig } from './repositoryFactory'
import { RepositoryContext } from './repositoryContext'

interface RepositoryProviderProps {
  children: ReactNode
  config?: RepositoryConfig
  repositories?: Repositories
}

export function RepositoryProvider({
  children,
  config = defaultRepositoryConfig,
  repositories,
}: RepositoryProviderProps) {
  const resolvedRepositories = useMemo(() => repositories ?? createRepositories(config), [config, repositories])

  return <RepositoryContext.Provider value={resolvedRepositories}>{children}</RepositoryContext.Provider>
}
