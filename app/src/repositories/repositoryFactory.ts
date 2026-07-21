import { createLocalRepositories, type LocalRepositoryOptions } from './localRepository'
import { createMockRepositories } from './mockRepository'
import type { Repositories } from './repository'
import { createServerRepositories, type ServerRepositoryOptions } from './serverRepository'

export type RepositoryConfig =
  | { kind: 'mock' }
  | ({ kind: 'local' } & LocalRepositoryOptions)
  | ({ kind: 'server' } & ServerRepositoryOptions)

export const defaultRepositoryConfig: RepositoryConfig = { kind: 'local' }

export function createRepositories(config: RepositoryConfig = defaultRepositoryConfig): Repositories {
  switch (config.kind) {
    case 'local':
      return createLocalRepositories(config)
    case 'server':
      return createServerRepositories(config)
    case 'mock':
      return createMockRepositories()
  }
}
