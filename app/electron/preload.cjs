const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('deek', {
  getRuntimeInfo: () => ipcRenderer.invoke('deek:get-runtime-info'),
  localRepository: (action, payload) => ipcRenderer.invoke('deek:local-repository', action, payload),
  importLocalAsset: (payload) => ipcRenderer.invoke('deek:import-local-asset', payload),
  importLocalAssetPath: (payload) => ipcRenderer.invoke('deek:import-local-asset-path', payload),
  getLocalStorageSettings: () => ipcRenderer.invoke('deek:get-local-storage-settings'),
  testLocalAssetStorage: (settings) => ipcRenderer.invoke('deek:test-local-asset-storage', settings),
  setLocalAssetStorage: (settings) => ipcRenderer.invoke('deek:set-local-asset-storage', settings),
  testLocalStoragePath: (basePath) => ipcRenderer.invoke('deek:test-local-storage-path', basePath),
  setLocalStoragePath: (basePath) => ipcRenderer.invoke('deek:set-local-storage-path', basePath),
  openLocalAssetsDir: () => ipcRenderer.invoke('deek:open-local-assets-dir'),
  deleteLocalAsset: (assetId) => ipcRenderer.invoke('deek:delete-local-asset', assetId),
  pruneLocalAssets: (referencedAssetIds) => ipcRenderer.invoke('deek:prune-local-assets', referencedAssetIds),
  exportLocalAssets: () => ipcRenderer.invoke('deek:export-local-assets'),
  restoreLocalAssets: (assets) => ipcRenderer.invoke('deek:restore-local-assets', assets),
  getLocalSecurityStatus: () => ipcRenderer.invoke('deek:get-local-security-status'),
  setLocalMasterPassword: (payload) => ipcRenderer.invoke('deek:set-local-master-password', payload),
  unlockLocalDatabase: (payload) => ipcRenderer.invoke('deek:unlock-local-database', payload),
  lockLocalDatabase: (payload) => ipcRenderer.invoke('deek:lock-local-database', payload),
  disableLocalMasterPassword: () => ipcRenderer.invoke('deek:disable-local-master-password'),
  openExternal: (target) => ipcRenderer.invoke('deek:open-external', target),
  statPath: (target) => ipcRenderer.invoke('deek:stat-path', target),
  showInFolder: (target) => ipcRenderer.invoke('deek:show-in-folder', target),
  selectBackupDir: () => ipcRenderer.invoke('deek:select-backup-dir'),
  selectPath: (options) => ipcRenderer.invoke('deek:select-path', options),
  writeBackupFile: (content) => ipcRenderer.invoke('deek:write-backup-file', content),
  writeEncryptedBackupFile: (content, password) => ipcRenderer.invoke('deek:write-encrypted-backup-file', content, password),
  writeBackupToDirectory: (directory, content) => ipcRenderer.invoke('deek:write-backup-to-directory', directory, content),
  writeEncryptedBackupToDirectory: (directory, content, password) => ipcRenderer.invoke('deek:write-encrypted-backup-to-directory', directory, content, password),
  readBackupFile: () => ipcRenderer.invoke('deek:read-backup-file'),
  readEncryptedBackupFile: (password) => ipcRenderer.invoke('deek:read-encrypted-backup-file', password),
  decryptBackupContent: (content, password) => ipcRenderer.invoke('deek:decrypt-backup-content', content, password),
  readLocalStore: () => ipcRenderer.invoke('deek:read-local-store'),
  writeLocalStore: (content) => ipcRenderer.invoke('deek:write-local-store', content),
  openUserDataDir: () => ipcRenderer.invoke('deek:open-user-data-dir'),
  clearLocalStore: () => ipcRenderer.invoke('deek:clear-local-store'),
  safeEncryptText: (value) => ipcRenderer.invoke('deek:safe-encrypt-text', value),
  safeDecryptText: (encryptedValue) => ipcRenderer.invoke('deek:safe-decrypt-text', encryptedValue),
  minimizeWindow: () => {
    ipcRenderer.send('deek:window-minimize')
    return Promise.resolve()
  },
  toggleMaximizeWindow: () => {
    ipcRenderer.send('deek:window-toggle-maximize')
    return Promise.resolve()
  },
  closeWindow: () => {
    ipcRenderer.send('deek:window-close')
    return Promise.resolve()
  },
})
