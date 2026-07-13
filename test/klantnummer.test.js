import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  klantnummerNorm,
  klantnummerDigits,
  splitPrefix,
  detectPattern,
  paddedVariants,
  analyzeToken
} from '../src/search/klantnummer.js'

test('klantnummerNorm uppercases and strips separators', () => {
  assert.equal(klantnummerNorm('kl-000.152'), 'KL000152')
  assert.equal(klantnummerNorm('  kl 152 '), 'KL152')
  assert.equal(klantnummerNorm(null), '')
})

test('klantnummerDigits strips non-digits and leading zeros', () => {
  assert.equal(klantnummerDigits('000152'), '152')
  assert.equal(klantnummerDigits('KL000152'), '152')
  assert.equal(klantnummerDigits('000'), '')
})

test('splitPrefix separates letters and digits', () => {
  assert.deepEqual(splitPrefix('KL000152'), { prefix: 'KL', digits: '000152' })
  assert.deepEqual(splitPrefix('152'), { prefix: '', digits: '152' })
})

test('detectPattern finds common prefix and digit length', () => {
  const p = detectPattern(['KL000152', 'KL000200', 'KL000999'])
  assert.equal(p.prefix, 'KL')
  assert.equal(p.digitLength, 6)
  assert.equal(p.padded, true)
})

test('paddedVariants produces bare and padded forms', () => {
  assert.deepEqual(paddedVariants('152', { digitLength: 6 }).sort(), ['000152', '152'])
  assert.deepEqual(paddedVariants('152', null), ['152'])
})

test('analyzeToken recognises number candidates', () => {
  const a = analyzeToken('KL152')
  assert.equal(a.isCandidate, true)
  assert.equal(a.digits, '152')
  assert.equal(analyzeToken('auto').isCandidate, false)
})
