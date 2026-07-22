import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { Readable } from 'node:stream'
import { createAssetStorage } from './storage.js'

test('filesystem asset storage writes, reads and deletes objects', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deek-assets-'))
  const storage = createAssetStorage({ driver: 'filesystem', filesystemPath: root })
  try {
    await storage.verifyWritable()
    await storage.put('workspace/asset/note.txt', Readable.from(['hello asset']), 'text/plain')
    assert.equal((await storage.stat('workspace/asset/note.txt')).size, 11)
    assert.equal(await readStream(await storage.get('workspace/asset/note.txt')), 'hello asset')
    await storage.delete('workspace/asset/note.txt')
    await assert.rejects(() => readFile(path.join(root, 'workspace/asset/note.txt')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('filesystem asset storage blocks traversal outside its root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deek-assets-'))
  const storage = createAssetStorage({ driver: 'filesystem', filesystemPath: root })
  try {
    await assert.rejects(() => storage.put('../escape.txt', Readable.from(['no']), 'text/plain'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('S3 asset storage writes, reads and deletes objects through the same contract', async () => {
  const objects = new Map<string, Buffer>()
  const server = http.createServer(async (request, response) => {
    const parts = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname).split('/').filter(Boolean)
    const objectKey = parts.slice(1).join('/')
    if (request.method === 'HEAD' && !objectKey) return void response.writeHead(200).end()
    if (request.method === 'PUT') {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      objects.set(objectKey, Buffer.concat(chunks))
      return void response.writeHead(200, { ETag: '"test-etag"' }).end()
    }
    if (request.method === 'HEAD') {
      const value = objects.get(objectKey)
      return void (value
        ? response.writeHead(200, { 'Content-Length': value.length, ETag: '"test-etag"' }).end()
        : response.writeHead(404).end())
    }
    if (request.method === 'GET') {
      const value = objects.get(objectKey)
      return void (value
        ? response.writeHead(200, { 'Content-Length': value.length, 'Content-Type': 'text/plain', ETag: '"test-etag"' }).end(value)
        : response.writeHead(404).end())
    }
    if (request.method === 'DELETE') {
      objects.delete(objectKey)
      return void response.writeHead(204).end()
    }
    response.writeHead(405).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert(address && typeof address !== 'string')
  const storage = createAssetStorage({
    driver: 's3', endpoint: `http://127.0.0.1:${address.port}`, region: 'us-east-1', bucket: 'deek-assets', forcePathStyle: true,
    credentials: { accessKey: 'test-access', secretKey: 'test-secret' },
  })
  try {
    await storage.verifyWritable()
    await storage.put('workspace/asset/s3.txt', Readable.from(['hello s3']), 'text/plain')
    assert.equal((await storage.stat('workspace/asset/s3.txt')).size, 8)
    assert.equal(await readStream(await storage.get('workspace/asset/s3.txt')), 'hello s3')
    await storage.delete('workspace/asset/s3.txt')
    assert.equal(objects.has('workspace/asset/s3.txt'), false)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

async function readStream(stored: Awaited<ReturnType<ReturnType<typeof createAssetStorage>['get']>>) {
  const chunks: Buffer[] = []
  for await (const chunk of stored.body) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}
