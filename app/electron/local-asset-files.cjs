const fs = require('node:fs/promises')
const { createReadStream, constants: fsConstants } = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

async function listManagedAssetFiles(root, current = root) {
  let entries
  try {
    entries = await fs.readdir(current, { withFileTypes: true })
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
  const files = []
  for (const entry of entries) {
    const target = path.join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listManagedAssetFiles(root, target))
    } else if (entry.isFile()) {
      files.push(target)
    }
  }
  return files
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function resolveTarget(root, relativePath) {
  const target = path.resolve(root, relativePath)
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Invalid managed asset path')
  return target
}

async function copyManagedAssetsVerified(sourceRoot, targetRoot) {
  const files = await listManagedAssetFiles(sourceRoot)
  let totalBytes = 0
  for (const source of files) {
    const relativePath = path.relative(sourceRoot, source)
    const target = resolveTarget(targetRoot, relativePath)
    await fs.mkdir(path.dirname(target), { recursive: true })
    try {
      await fs.stat(target)
      if (await hashFile(source) !== await hashFile(target)) throw new Error(`目标目录存在同名但内容不同的文件：${relativePath}`)
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error
      await fs.copyFile(source, target, fsConstants.COPYFILE_EXCL)
    }
    const [sourceStat, targetStat] = await Promise.all([fs.stat(source), fs.stat(target)])
    if (sourceStat.size !== targetStat.size || await hashFile(source) !== await hashFile(target)) {
      throw new Error(`文件迁移校验失败：${relativePath}`)
    }
    totalBytes += sourceStat.size
  }
  return { files: files.length, totalBytes }
}

async function exportManagedAssetsForBackup(root, options = {}) {
  const maxFileBytes = options.maxFileBytes ?? 16 * 1024 * 1024
  const totalMaxBytes = options.totalMaxBytes ?? 64 * 1024 * 1024
  const files = await listManagedAssetFiles(root)
  const assets = []
  const omitted = []
  let includedBytes = 0
  for (const filePath of files) {
    const relativePath = path.relative(root, filePath).split(path.sep).join('/')
    const metadata = await fs.stat(filePath)
    if (metadata.size > maxFileBytes || includedBytes + metadata.size > totalMaxBytes) {
      omitted.push({ relativePath, sizeBytes: metadata.size })
      continue
    }
    assets.push({ relativePath, contentBase64: (await fs.readFile(filePath)).toString('base64') })
    includedBytes += metadata.size
  }
  return { assets, omitted }
}

function decodeBackupAsset(contentBase64) {
  if (typeof contentBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(contentBase64)) {
    throw new Error('Invalid local asset content')
  }
  return Buffer.from(contentBase64, 'base64')
}

async function restoreManagedAssetsMerged(root, assets) {
  if (!Array.isArray(assets)) throw new Error('Invalid local assets payload')

  const resolvedRoot = path.resolve(root)
  const parent = path.dirname(resolvedRoot)
  const suffix = crypto.randomUUID()
  const stagingRoot = path.join(parent, `.managed-assets-restore-${suffix}`)
  const previousRoot = path.join(parent, `.managed-assets-previous-${suffix}`)
  const preparedAssets = assets.map((asset) => {
    if (!asset || typeof asset.relativePath !== 'string') throw new Error('Invalid local asset in backup')
    const target = resolveTarget(stagingRoot, asset.relativePath)
    return { target, bytes: decodeBackupAsset(asset.contentBase64) }
  })

  let movedPrevious = false
  try {
    try {
      await fs.cp(resolvedRoot, stagingRoot, { recursive: true, errorOnExist: true, force: false })
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error
      await fs.mkdir(stagingRoot, { recursive: true })
    }

    for (const asset of preparedAssets) {
      await fs.mkdir(path.dirname(asset.target), { recursive: true })
      await fs.writeFile(asset.target, asset.bytes)
    }

    try {
      await fs.rename(resolvedRoot, previousRoot)
      movedPrevious = true
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error
    }
    await fs.rename(stagingRoot, resolvedRoot)
    if (movedPrevious) await fs.rm(previousRoot, { recursive: true, force: true }).catch(() => undefined)
  } catch (error) {
    await fs.rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined)
    if (movedPrevious) {
      await fs.rm(resolvedRoot, { recursive: true, force: true }).catch(() => undefined)
      await fs.rename(previousRoot, resolvedRoot).catch(() => undefined)
    }
    throw error
  }
}

module.exports = {
  copyManagedAssetsVerified,
  exportManagedAssetsForBackup,
  hashFile,
  listManagedAssetFiles,
  restoreManagedAssetsMerged,
}
