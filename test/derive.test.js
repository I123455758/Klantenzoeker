import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeDerived, BLOB_FIELDS } from '../src/search/derive.js'

test('computeDerived builds normalised search blob', () => {
  const d = computeDerived({
    klantnummer: '152',
    klantnaam: 'JIMÉNEZ MAÑA RECAMBIOS SRL',
    grk5_a: 'G200'
  })
  assert.match(d.search_blob, /jimenez mana recambios srl/)
  assert.match(d.search_blob, /g200/)
  assert.ok(d.search_blob.startsWith('152 '))
})

test('computeDerived skips empty fields', () => {
  const d = computeDerived({ klantnummer: '152', klantnaam: 'AUTO CARS BV', grk5_a: '' })
  assert.equal(d.search_blob.includes('  '), false)
  assert.ok(d.search_blob.startsWith('152 auto cars bv'))
})

test('BLOB_FIELDS excludes klantnummer (added separately)', () => {
  assert.equal(BLOB_FIELDS.includes('klantnummer'), false)
})
