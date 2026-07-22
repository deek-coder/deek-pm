module.exports = async function waitForWindowsExecutableScan(context) {
  if (context.electronPlatformName !== 'win32') return

  // Windows Defender may briefly lock the Electron executable immediately
  // after ASAR integrity is embedded. Give real-time scanning time to release
  // the file before electron-builder invokes rcedit for icon/version metadata.
  const configuredDelay = Number(process.env.DEEK_WINDOWS_PACK_DELAY_MS ?? 10000)
  const delayMs = Number.isFinite(configuredDelay) && configuredDelay >= 0 ? configuredDelay : 10000
  if (delayMs === 0) return

  console.log(`  • waiting for Windows executable scan  delay=${delayMs}ms`)
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}
