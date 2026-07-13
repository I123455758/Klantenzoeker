import { test } from 'node:test'
import assert from 'node:assert/strict'
import { klantnummerDigits } from '../src/search/klantnummer.js'

test('klantnummerDigits strips non-digits and leading zeros', () => {
  assert.equal(klantnummerDigits('000152'), '152')
  assert.equal(klantnummerDigits('KL000152'), '152')
  assert.equal(klantnummerDigits('1379'), '1379')
  assert.equal(klantnummerDigits('000'), '')
  assert.equal(klantnummerDigits(null), '')
})
