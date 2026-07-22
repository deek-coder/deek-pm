/// <reference types="vite/client" />

interface DeekRuntimeInfo {
  platform: NodeJS.Platform
  userDataPath: string
  documentsPath: string
  safeStorageAvailable: boolean
  localDatabasePath?: string
}

interface DeekOpenResult {
  ok: boolean
  error?: string
}

interface DeekFileResult extends DeekOpenResult {
  canceled?: boolean
  filePath?: string
  content?: string
  encrypted?: boolean
}

interface DeekPathStatResult extends DeekOpenResult {
  exists: boolean
  kind?: 'file' | 'directory' | 'other'
  updatedAt?: string
}

interface DeekSelectPathOptions {
  kind: 'file' | 'directory' | 'any'
  title?: string
}

interface DeekRepositoryResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  code?: string
}

interface DeekLocalSecurityStatus {
  configured: boolean
  locked: boolean
  remembered: boolean
  safeStorageAvailable: boolean
  databasePath: string
}

type DeekLocalStorageSettings = {
  driver: 'filesystem'
  configured: boolean
  basePath?: string | null
  assetsPath: string
  defaultPath: string
  updatedAt?: string
} | {
  driver: 's3'
  configured: true
  endpoint: string
  region: string
  bucket: string
  forcePathStyle: boolean
  hasCredentials: boolean
  assetsPath: string
  defaultPath: string
  updatedAt?: string
}

type DeekLocalAssetStorageInput = {
  driver: 'filesystem'
  basePath: string | null
} | {
  driver: 's3'
  endpoint: string
  region: string
  bucket: string
  forcePathStyle: boolean
  credentials?: { accessKey: string; secretKey: string }
}

type DeekLocalStorageMigrationResult = DeekLocalStorageSettings & {
  migratedFiles: number
  migratedBytes: number
  cleanupWarning?: string
}

interface DeekMasterPasswordPayload {
  password: string
  remember?: boolean
}

interface Window {
  deek?: {
    getRuntimeInfo(): Promise<DeekRuntimeInfo>
    localRepository<T = unknown>(action: string, payload?: unknown): Promise<DeekRepositoryResult<T>>
    importLocalAsset(payload: {
      workspaceId: string
      kind: 'image' | 'attachment'
      name: string
      mimeType: string
      bytes: ArrayBuffer
    }): Promise<DeekRepositoryResult<import('./repositories/repository').ManagedAsset>>
    importLocalAssetPath(payload: {
      workspaceId: string
      kind: 'image' | 'attachment'
      filePath: string
    }): Promise<DeekRepositoryResult<import('./repositories/repository').ManagedAsset>>
    getLocalStorageSettings(): Promise<DeekRepositoryResult<DeekLocalStorageSettings>>
    testLocalAssetStorage(settings: DeekLocalAssetStorageInput): Promise<DeekRepositoryResult<{ driver: 'filesystem' | 's3' }>>
    setLocalAssetStorage(settings: DeekLocalAssetStorageInput): Promise<DeekRepositoryResult<DeekLocalStorageMigrationResult>>
    testLocalStoragePath(basePath: string): Promise<DeekRepositoryResult<{ assetsPath: string }>>
    setLocalStoragePath(basePath: string | null): Promise<DeekRepositoryResult<DeekLocalStorageMigrationResult>>
    openLocalAssetsDir(): Promise<DeekOpenResult>
    deleteLocalAsset(assetId: string): Promise<DeekRepositoryResult<void>>
    pruneLocalAssets(referencedAssetIds: string[]): Promise<DeekRepositoryResult<{ deleted: number }>>
    exportLocalAssets(): Promise<DeekRepositoryResult<{
      assets: import('./repositories/repository').LocalBackupAsset[]
      omitted: Array<{ relativePath: string; sizeBytes: number }>
    }>>
    restoreLocalAssets(assets: import('./repositories/repository').LocalBackupAsset[]): Promise<DeekRepositoryResult<void>>
    getLocalSecurityStatus(): Promise<DeekRepositoryResult<DeekLocalSecurityStatus>>
    setLocalMasterPassword(payload: DeekMasterPasswordPayload): Promise<DeekRepositoryResult<DeekLocalSecurityStatus>>
    unlockLocalDatabase(payload: DeekMasterPasswordPayload): Promise<DeekRepositoryResult<DeekLocalSecurityStatus>>
    lockLocalDatabase(payload?: { forgetRemembered?: boolean }): Promise<DeekRepositoryResult<DeekLocalSecurityStatus>>
    disableLocalMasterPassword(): Promise<DeekRepositoryResult<DeekLocalSecurityStatus>>
    openExternal(target: string): Promise<DeekOpenResult>
    statPath(target: string): Promise<DeekPathStatResult>
    showInFolder(target: string): Promise<DeekOpenResult>
    selectBackupDir(): Promise<string | null>
    selectPath(options: DeekSelectPathOptions): Promise<string | null>
    writeBackupFile(content: string): Promise<DeekFileResult>
    writeEncryptedBackupFile(content: string, password: string): Promise<DeekFileResult>
    writeBackupToDirectory(directory: string, content: string): Promise<DeekFileResult>
    writeEncryptedBackupToDirectory(directory: string, content: string, password: string): Promise<DeekFileResult>
    readBackupFile(): Promise<DeekFileResult>
    readEncryptedBackupFile(password: string): Promise<DeekFileResult>
    decryptBackupContent(content: string, password: string): Promise<DeekFileResult>
    readLocalStore(): Promise<DeekFileResult>
    writeLocalStore(content: string): Promise<DeekFileResult>
    openUserDataDir(): Promise<DeekOpenResult>
    clearLocalStore(): Promise<DeekFileResult>
    safeEncryptText(value: string): Promise<string | null>
    safeDecryptText(encryptedValue: string): Promise<string | null>
    minimizeWindow(): Promise<void>
    toggleMaximizeWindow(): Promise<void>
    closeWindow(): Promise<void>
  }
}
