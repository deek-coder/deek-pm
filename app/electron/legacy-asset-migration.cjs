const crypto = require('node:crypto')
const path = require('node:path')

const inlineImagePattern = /data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/]+={0,2})/gi
const defaultMaxImageBytes = 100 * 1024 * 1024
const mimeExtensions = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif'],
  ['image/bmp', '.bmp'],
  ['image/svg+xml', '.svg'],
])

function decodeBase64Strict(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 === 1) throw new Error('旧图片的 Base64 数据无效')
  const unpadded = value.replace(/=+$/, '')
  const padded = `${unpadded}${'='.repeat((4 - (unpadded.length % 4)) % 4)}`
  const bytes = Buffer.from(padded, 'base64')
  if (bytes.length === 0 || bytes.toString('base64').replace(/=+$/, '') !== unpadded) throw new Error('旧图片的 Base64 数据无效')
  return bytes
}

function prepareLegacyInlineImageMigration(content, options = {}) {
  if (typeof content !== 'string' || !/data:image\//i.test(content)) return { content, images: [] }
  const maxImageBytes = options.maxImageBytes ?? defaultMaxImageBytes
  const images = new Map()
  let occurrence = 0
  const preparedContent = content.replace(inlineImagePattern, (source, rawMimeType, encoded) => {
    const mimeType = rawMimeType.toLowerCase() === 'image/jpg' ? 'image/jpeg' : rawMimeType.toLowerCase()
    const extension = mimeExtensions.get(mimeType)
    if (!extension) return source
    const bytes = decodeBase64Strict(encoded)
    if (bytes.length > maxImageBytes) throw new Error(`旧图片超过迁移上限（${Math.floor(maxImageBytes / 1024 / 1024)} MB）`)
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
    const placeholder = `deek-legacy-inline-image://${sha256}/${occurrence}`
    occurrence += 1
    if (!images.has(sha256)) {
      images.set(sha256, {
        id: `local-${sha256}`,
        kind: 'image',
        originalName: `legacy-image-${sha256.slice(0, 12)}${extension}`,
        mimeType,
        sizeBytes: bytes.length,
        sha256,
        objectKey: path.posix.join(sha256.slice(0, 2), `${sha256}${extension}`),
        bytes,
        placeholders: [],
      })
    }
    images.get(sha256).placeholders.push(placeholder)
    return placeholder
  })
  return { content: preparedContent, images: [...images.values()] }
}

async function verifyStoredImage(storage, asset) {
  const stored = await storage.get(asset.objectKey)
  const hash = crypto.createHash('sha256')
  let size = 0
  for await (const chunk of stored.body) {
    const bytes = Buffer.from(chunk)
    size += bytes.length
    hash.update(bytes)
  }
  if (size !== asset.sizeBytes || hash.digest('hex') !== asset.sha256) throw new Error(`旧图片写入校验失败：${asset.originalName}`)
}

async function writeVerifiedImage(storage, asset) {
  await storage.putBuffer(asset.objectKey, asset.bytes, asset.mimeType)
  try {
    await verifyStoredImage(storage, asset)
  } catch {
    await storage.delete(asset.objectKey)
    await storage.putBuffer(asset.objectKey, asset.bytes, asset.mimeType)
    await verifyStoredImage(storage, asset)
  }
}

async function migrateLegacyInlineImages({ database, storage, batchSize = 25, maxImageBytes, onProgress }) {
  let afterEntryId = ''
  const result = { scannedEntries: 0, migratedEntries: 0, migratedAssets: 0, failedEntries: 0, errors: [] }
  while (true) {
    const candidates = database.handle('listLegacyInlineImageEntries', { afterEntryId, limit: batchSize })
    if (candidates.length === 0) break
    for (const candidate of candidates) {
      afterEntryId = candidate.entryId
      result.scannedEntries += 1
      try {
        const prepared = prepareLegacyInlineImageMigration(candidate.content, { maxImageBytes })
        if (prepared.images.length === 0) continue
        let nextContent = prepared.content
        const records = []
        for (const image of prepared.images) {
          const existing = database.handle('getAsset', { id: image.id })
          const target = existing
            ? { ...existing, status: 'ready' }
            : { ...image, workspaceId: 'local-personal', status: 'ready' }
          await writeVerifiedImage(storage, { ...image, objectKey: target.objectKey, originalName: target.originalName })
          const storedUrl = `deek-asset://managed-assets/${target.objectKey}`
          for (const placeholder of image.placeholders) nextContent = nextContent.split(placeholder).join(storedUrl)
          if (!existing || existing.status !== 'ready') records.push({ ...target, bytes: undefined })
        }
        const committed = database.handle('commitLegacyInlineImageMigration', {
          entryId: candidate.entryId,
          expectedContent: candidate.content,
          content: nextContent,
          assets: records,
        })
        if (!committed) continue
        result.migratedEntries += 1
        result.migratedAssets += prepared.images.length
      } catch (error) {
        result.failedEntries += 1
        result.errors.push({ entryId: candidate.entryId, error: error && error.message ? error.message : String(error) })
      }
      onProgress?.({ ...result })
    }
  }
  return result
}

module.exports = { migrateLegacyInlineImages, prepareLegacyInlineImageMigration }
