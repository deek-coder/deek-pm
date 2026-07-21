import { createContext, useContext } from 'react'
import type { Repositories } from './repository'

export const RepositoryContext = createContext<Repositories | null>(null)

export function useRepositories() {
  const repositories = useContext(RepositoryContext)
  if (!repositories) {
    throw new Error('useRepositories must be used within RepositoryProvider')
  }
  return repositories
}

export function useRepositorySource() {
  return useRepositories().source
}
