import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { DatabasePool } from './db.js'
import { decryptJson } from './crypto.js'

export interface StorageCredentials {
  accessKey: string
  secretKey: string
}

export type StorageSettings =
  | { driver: 'filesystem'; filesystemPath: string }
  | {
      driver: 's3'
      endpoint: string
      region: string
      bucket: string
      forcePathStyle: boolean
      credentials: StorageCredentials
    }

export interface AssetStorage {
  ensureReady(): Promise<void>
  verifyWritable(): Promise<void>
  put(objectKey: string, body: Readable, contentType: string): Promise<void>
  get(objectKey: string): Promise<{ body: Readable; contentType?: string; contentLength?: number }>
  stat(objectKey: string): Promise<{ size: number }>
  delete(objectKey: string): Promise<void>
}

class FileSystemAssetStorage implements AssetStorage {
  constructor(private readonly rootPath: string) {}

  private resolve(objectKey: string) {
    const target = path.resolve(this.rootPath, objectKey)
    const root = path.resolve(this.rootPath)
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Invalid object key')
    return target
  }

  async ensureReady() {
    await mkdir(this.rootPath, { recursive: true })
  }

  async verifyWritable() {
    await this.ensureReady()
    const probe = path.join(this.rootPath, `.deek-write-test-${randomUUID()}`)
    await writeFile(probe, 'ok', { flag: 'wx' })
    await unlink(probe)
  }

  async put(objectKey: string, body: Readable) {
    const target = this.resolve(objectKey)
    await mkdir(path.dirname(target), { recursive: true })
    await pipeline(body, createWriteStream(target, { flags: 'wx' }))
  }

  async get(objectKey: string) {
    const target = this.resolve(objectKey)
    const metadata = await stat(target)
    return { body: createReadStream(target), contentLength: metadata.size }
  }

  async stat(objectKey: string) {
    const metadata = await stat(this.resolve(objectKey))
    return { size: metadata.size }
  }

  async delete(objectKey: string) {
    await unlink(this.resolve(objectKey)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

class S3AssetStorage implements AssetStorage {
  private readonly client: S3Client

  constructor(private readonly settings: Extract<StorageSettings, { driver: 's3' }>) {
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
      const statusCode = typeof error === 'object' && error && '$metadata' in error
        ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
        : undefined
      const errorName = typeof error === 'object' && error && 'name' in error ? String(error.name) : ''
      if (statusCode !== 404 && errorName !== 'NotFound' && errorName !== 'NoSuchBucket') throw error
      await this.client.send(new CreateBucketCommand({ Bucket: this.settings.bucket }))
    }
  }

  async verifyWritable() {
    await this.ensureReady()
    const key = `.deek-write-test-${randomUUID()}`
    await this.put(key, Readable.from(['ok']), 'text/plain')
    await this.delete(key)
  }

  async put(objectKey: string, body: Readable, contentType: string) {
    await new Upload({
      client: this.client,
      params: { Bucket: this.settings.bucket, Key: objectKey, Body: body, ContentType: contentType },
    }).done()
  }

  async get(objectKey: string) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.settings.bucket, Key: objectKey }))
    if (!result.Body) throw new Error('Stored object has no body')
    return { body: result.Body as Readable, contentType: result.ContentType, contentLength: result.ContentLength }
  }

  async stat(objectKey: string) {
    const result = await this.client.send(new HeadObjectCommand({ Bucket: this.settings.bucket, Key: objectKey }))
    return { size: result.ContentLength ?? 0 }
  }

  async delete(objectKey: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: objectKey }))
  }
}

export function createAssetStorage(settings: StorageSettings): AssetStorage {
  return settings.driver === 's3'
    ? new S3AssetStorage(settings)
    : new FileSystemAssetStorage(path.resolve(settings.filesystemPath))
}

interface StorageSettingsRow {
  driver: 'filesystem' | 's3'
  filesystem_path: string | null
  s3_endpoint: string | null
  s3_region: string | null
  s3_bucket: string | null
  s3_force_path_style: boolean
  credentials_encrypted: string | null
  updated_at: string | Date
}

export class StorageManager {
  constructor(private readonly pool: DatabasePool, private readonly encryptionKey: string) {}

  async readSettings(): Promise<(StorageSettings & { updatedAt: string }) | null> {
    const result = await this.pool.query<StorageSettingsRow>('SELECT * FROM storage_settings WHERE id = 1')
    const row = result.rows[0]
    if (!row) return null
    const updatedAt = new Date(row.updated_at).toISOString()
    if (row.driver === 'filesystem' && row.filesystem_path) {
      return { driver: 'filesystem', filesystemPath: row.filesystem_path, updatedAt }
    }
    const credentials = decryptJson<StorageCredentials>(row.credentials_encrypted, this.encryptionKey)
    if (row.driver === 's3' && row.s3_endpoint && row.s3_bucket && credentials) {
      return {
        driver: 's3',
        endpoint: row.s3_endpoint,
        region: row.s3_region ?? 'us-east-1',
        bucket: row.s3_bucket,
        forcePathStyle: row.s3_force_path_style,
        credentials,
        updatedAt,
      }
    }
    return null
  }

  async getStorage() {
    const settings = await this.readSettings()
    if (!settings) throw Object.assign(new Error('服务端尚未配置文件存储位置'), { statusCode: 503 })
    return createAssetStorage(settings)
  }
}
