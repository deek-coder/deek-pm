import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const algorithm = 'aes-256-gcm'

function deriveKey(secret: string) {
  return createHash('sha256').update(secret, 'utf8').digest()
}

export function encryptJson(value: unknown, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(algorithm, deriveKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decryptJson<T>(value: string | null, secret: string): T | undefined {
  if (!value) return undefined
  const [version, iv, tag, encrypted] = value.split(':')
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Unsupported encrypted data format')
  const decipher = createDecipheriv(algorithm, deriveKey(secret), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  const cleartext = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()])
  return JSON.parse(cleartext.toString('utf8')) as T
}
