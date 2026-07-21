import assert from 'node:assert/strict'
import test from 'node:test'
import { decryptJson, encryptJson } from './crypto.js'

const secret = 'unit-test-secret-with-more-than-thirty-two-characters'

test('sensitive JSON is encrypted and can be decrypted', () => {
  const input = [{ id: 'password-1', name: '数据库', valuePreview: 'secret-value' }]
  const encrypted = encryptJson(input, secret)

  assert.match(encrypted, /^v1:/)
  assert.equal(encrypted.includes('secret-value'), false)
  assert.deepEqual(decryptJson(encrypted, secret), input)
})

test('encrypted JSON cannot be decrypted with another key', () => {
  const encrypted = encryptJson({ value: 'secret' }, secret)
  assert.throws(() => decryptJson(encrypted, `${secret}-wrong`))
})
