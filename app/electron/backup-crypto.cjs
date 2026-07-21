const crypto = require('node:crypto')
const zlib = require('node:zlib')
const { promisify } = require('node:util')

const gzip = promisify(zlib.gzip)
const gunzip = promisify(zlib.gunzip)

async function createEncryptedBackupEnvelope(content, password) {
  assertBackupPassword(password)
  const compressed = await gzip(Buffer.from(content, 'utf8'))
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(password, salt, 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()])
  return {
    format: 'deekbak',
    version: 2,
    createdAt: new Date().toISOString(),
    compression: 'gzip',
    kdf: 'scrypt',
    cipher: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  }
}

async function decryptEncryptedBackupEnvelope(envelope, password) {
  assertBackupPassword(password)
  const key = crypto.scryptSync(password, Buffer.from(envelope.salt, 'base64'), 32)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  const compressed = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()])
  return (await gunzip(compressed)).toString('utf8')
}

function isEncryptedBackupEnvelope(value) {
  return value?.format === 'deekbak' && value.version === 2 && value.cipher === 'aes-256-gcm' && value.compression === 'gzip'
}

function assertBackupPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('备份密码至少需要 8 个字符')
}

module.exports = {
  createEncryptedBackupEnvelope,
  decryptEncryptedBackupEnvelope,
  isEncryptedBackupEnvelope,
}
