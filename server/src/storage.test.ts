import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
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

async function readStream(stored: Awaited<ReturnType<ReturnType<typeof createAssetStorage>['get']>>) {
  const chunks: Buffer[] = []
  for await (const chunk of stored.body) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}
