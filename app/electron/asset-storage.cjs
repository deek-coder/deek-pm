const { createReadStream, createWriteStream, constants: fsConstants } = require('node:fs')
const { pipeline } = require('node:stream/promises')
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3')
const { Upload } = require('@aws-sdk/lib-storage')

function resolveFileObject(rootPath, objectKey) {
  const root = path.resolve(rootPath)
  const target = path.resolve(root, objectKey)
  if (target === root || !target.startsWith(`${root}${path.sep}`)) throw new Error('Invalid asset object key')
  return target
}

class FileSystemAssetStorage {
  constructor(settings) {
    this.driver = 'filesystem'
    this.rootPath = path.resolve(settings.rootPath)
  }

  async ensureReady() {
    await fs.mkdir(this.rootPath, { recursive: true })
  }

  async verifyWritable() {
    await this.ensureReady()
    const probe = resolveFileObject(this.rootPath, `.deek-write-test-${crypto.randomUUID()}`)
    await fs.writeFile(probe, 'ok', { flag: 'wx' })
    await fs.unlink(probe)
  }

  async putBuffer(objectKey, bytes) {
    const target = resolveFileObject(this.rootPath, objectKey)
    await fs.mkdir(path.dirname(target), { recursive: true })
    try {
      await fs.writeFile(target, bytes, { flag: 'wx' })
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error
    }
  }

  async putStream(objectKey, body) {
    const target = resolveFileObject(this.rootPath, objectKey)
    await fs.mkdir(path.dirname(target), { recursive: true })
    const temporary = `${target}.tmp-${crypto.randomUUID()}`
    try {
      await pipeline(body, createWriteStream(temporary, { flags: 'wx' }))
      try {
        await fs.rename(temporary, target)
      } catch (error) {
        if (!error || !['EEXIST', 'EPERM'].includes(error.code)) throw error
        await fs.unlink(temporary)
      }
    } catch (error) {
      await fs.unlink(temporary).catch(() => undefined)
      throw error
    }
  }

  async putFile(objectKey, sourcePath) {
    const target = resolveFileObject(this.rootPath, objectKey)
    await fs.mkdir(path.dirname(target), { recursive: true })
    if (path.resolve(sourcePath).toLowerCase() === target.toLowerCase()) return
    try {
      await fs.copyFile(sourcePath, target, fsConstants.COPYFILE_EXCL)
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error
    }
  }

  async get(objectKey) {
    const target = resolveFileObject(this.rootPath, objectKey)
    const metadata = await fs.stat(target)
    return { body: createReadStream(target), contentLength: metadata.size }
  }

  async stat(objectKey) {
    const metadata = await fs.stat(resolveFileObject(this.rootPath, objectKey))
    return { size: metadata.size }
  }

  async delete(objectKey) {
    await fs.unlink(resolveFileObject(this.rootPath, objectKey)).catch((error) => {
      if (!error || error.code !== 'ENOENT') throw error
    })
  }
}

class S3AssetStorage {
  constructor(settings) {
    this.driver = 's3'
    this.settings = settings
    this.client = new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      forcePathStyle: settings.forcePathStyle,
      credentials: {
        accessKeyId: settings.credentials.accessKey,
        secretAccessKey: settings.credentials.secretKey,
      },
    })
  }

  async ensureReady() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.settings.bucket }))
    } catch (error) {
      const statusCode = error && error.$metadata ? error.$metadata.httpStatusCode : undefined
      const name = error && error.name ? String(error.name) : ''
      if (statusCode !== 404 && name !== 'NotFound' && name !== 'NoSuchBucket') throw error
      await this.client.send(new CreateBucketCommand({ Bucket: this.settings.bucket }))
    }
  }

  async verifyWritable() {
    await this.ensureReady()
    const objectKey = `.deek-write-test-${crypto.randomUUID()}`
    await this.putBuffer(objectKey, Buffer.from('ok'))
    await this.delete(objectKey)
  }

  async putBuffer(objectKey, bytes, contentType = 'application/octet-stream') {
    await new Upload({
      client: this.client,
      params: { Bucket: this.settings.bucket, Key: objectKey, Body: bytes, ContentType: contentType },
    }).done()
  }

  async putStream(objectKey, body, contentType = 'application/octet-stream') {
    await new Upload({
      client: this.client,
      params: { Bucket: this.settings.bucket, Key: objectKey, Body: body, ContentType: contentType },
    }).done()
  }

  async putFile(objectKey, sourcePath, contentType = 'application/octet-stream') {
    await new Upload({
      client: this.client,
      params: { Bucket: this.settings.bucket, Key: objectKey, Body: createReadStream(sourcePath), ContentType: contentType },
    }).done()
  }

  async get(objectKey) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.settings.bucket, Key: objectKey }))
    if (!result.Body) throw new Error('Stored object has no body')
    return { body: result.Body, contentType: result.ContentType, contentLength: result.ContentLength }
  }

  async stat(objectKey) {
    const result = await this.client.send(new HeadObjectCommand({ Bucket: this.settings.bucket, Key: objectKey }))
    return { size: result.ContentLength ?? 0 }
  }

  async delete(objectKey) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: objectKey }))
  }
}

function createAssetStorage(settings) {
  if (settings.driver === 's3') return new S3AssetStorage(settings)
  return new FileSystemAssetStorage(settings)
}

async function migrateAssetRecords(source, target, records) {
  await target.verifyWritable()
  let files = 0
  let totalBytes = 0
  for (const asset of records) {
    const stored = await source.get(asset.objectKey)
    await target.putStream(asset.objectKey, stored.body, asset.mimeType)
    const copied = await target.stat(asset.objectKey)
    if (copied.size !== asset.sizeBytes) throw new Error(`资产迁移校验失败：${asset.originalName}`)
    files += 1
    totalBytes += copied.size
  }
  return { files, totalBytes }
}

module.exports = { createAssetStorage, FileSystemAssetStorage, S3AssetStorage, migrateAssetRecords }
