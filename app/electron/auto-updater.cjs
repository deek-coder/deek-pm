function normalizeError(error) {
  if (error && typeof error.message === 'string') return error.message
  return typeof error === 'string' ? error : '应用更新失败'
}

function createAutoUpdateService({ app, autoUpdater, getWindows }) {
  const portable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE)
  const supported = app.isPackaged && process.platform === 'win32' && !portable
  let state = {
    phase: supported ? 'idle' : 'unsupported',
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    distribution: !app.isPackaged ? 'development' : portable ? 'portable' : 'installed',
    message: !app.isPackaged
      ? '开发环境不会执行自动更新，请在安装版中测试。'
      : portable
        ? '便携版不支持自动安装，请前往 GitHub Releases 下载新版本。'
        : process.platform !== 'win32'
          ? '当前平台尚未配置自动更新。'
          : undefined,
  }
  let checkPromise = null

  const snapshot = () => ({ ...state })
  const publish = (patch) => {
    state = { ...state, ...patch }
    for (const window of getWindows()) {
      if (!window.isDestroyed()) window.webContents.send('deek:update-state', snapshot())
    }
    return snapshot()
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => publish({ phase: 'checking', message: '正在检查 GitHub Releases…', error: undefined }))
  autoUpdater.on('update-available', (info) => publish({
    phase: 'available',
    latestVersion: info.version,
    releaseName: info.releaseName || undefined,
    releaseDate: info.releaseDate || undefined,
    message: `发现新版本 v${info.version}`,
    error: undefined,
  }))
  autoUpdater.on('update-not-available', (info) => publish({
    phase: 'not-available',
    latestVersion: info.version,
    message: '当前已是最新版本。',
    error: undefined,
  }))
  autoUpdater.on('download-progress', (progress) => publish({
    phase: 'downloading',
    percent: Math.max(0, Math.min(100, progress.percent || 0)),
    transferred: progress.transferred,
    total: progress.total,
    bytesPerSecond: progress.bytesPerSecond,
    message: `正在下载 v${state.latestVersion || ''}`.trim(),
    error: undefined,
  }))
  autoUpdater.on('update-downloaded', (info) => publish({
    phase: 'downloaded',
    latestVersion: info.version,
    percent: 100,
    message: '更新已下载，重启应用即可安装。',
    error: undefined,
  }))
  autoUpdater.on('error', (error) => publish({ phase: 'error', message: '检查或下载更新失败。', error: normalizeError(error) }))

  return {
    getState: snapshot,
    async check() {
      if (!supported) return snapshot()
      if (checkPromise) return checkPromise
      publish({ phase: 'checking', message: '正在检查 GitHub Releases…', error: undefined })
      checkPromise = autoUpdater.checkForUpdates()
        .then(() => snapshot())
        .catch((error) => publish({ phase: 'error', message: '检查更新失败。', error: normalizeError(error) }))
        .finally(() => { checkPromise = null })
      return checkPromise
    },
    async download() {
      if (!supported) return snapshot()
      if (state.phase !== 'available' && state.phase !== 'error') return snapshot()
      publish({ phase: 'downloading', percent: 0, message: '正在准备下载更新…', error: undefined })
      try {
        await autoUpdater.downloadUpdate()
      } catch (error) {
        publish({ phase: 'error', message: '下载更新失败。', error: normalizeError(error) })
      }
      return snapshot()
    },
    install() {
      if (!supported || state.phase !== 'downloaded') return false
      publish({ phase: 'installing', message: '正在退出并安装更新…', error: undefined })
      setImmediate(() => autoUpdater.quitAndInstall(false, true))
      return true
    },
  }
}

module.exports = { createAutoUpdateService }
