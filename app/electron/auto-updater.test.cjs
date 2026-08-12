const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const test = require('node:test')
const { createAutoUpdateService } = require('./auto-updater.cjs')

class FakeUpdater extends EventEmitter {
  async checkForUpdates() {
    this.emit('update-available', { version: '0.2.0', releaseName: 'Test release', releaseDate: '2026-07-22T00:00:00Z' })
  }

  async downloadUpdate() {
    this.emit('download-progress', { percent: 42, transferred: 42, total: 100, bytesPerSecond: 10 })
    this.emit('update-downloaded', { version: '0.2.0' })
  }
}

test('development builds expose an unsupported state without checking the network', async () => {
  const updater = new FakeUpdater()
  let checks = 0
  updater.checkForUpdates = async () => { checks += 1 }
  const service = createAutoUpdateService({ app: { isPackaged: false, getVersion: () => '0.1.1' }, autoUpdater: updater, getWindows: () => [] })
  assert.equal(service.getState().phase, 'unsupported')
  await service.check()
  assert.equal(checks, 0)
})

test('packaged builds progress from available to downloaded', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: 'win32' })
  try {
    const updater = new FakeUpdater()
    const states = []
    const window = { isDestroyed: () => false, webContents: { send: (_channel, state) => states.push(state) } }
    const service = createAutoUpdateService({ app: { isPackaged: true, getVersion: () => '0.1.1' }, autoUpdater: updater, getWindows: () => [window] })
    await service.check()
    assert.equal(service.getState().phase, 'available')
    assert.equal(service.getState().latestVersion, '0.2.0')
    await service.download()
    assert.equal(service.getState().phase, 'downloaded')
    assert.equal(service.getState().percent, 100)
    assert.ok(states.some((state) => state.phase === 'downloading'))
  } finally {
    Object.defineProperty(process, 'platform', originalDescriptor)
  }
})
