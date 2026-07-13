import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normHeader, autoMap, applyMapping } from '../src/import/mapping.js'

test('normHeader lowercases and strips non-alphanumerics', () => {
  assert.equal(normHeader('Klant-Nr.'), 'klantnr')
  assert.equal(normHeader('Grk5 (2)'), 'grk52')
})

test('autoMap matches the real export columns', () => {
  const m = autoMap(['Klant', 'Omschrijving', 'Grk5', 'Grk5 (2)'])
  assert.equal(m.klantnummer, 'Klant')
  assert.equal(m.klantnaam, 'Omschrijving')
  assert.equal(m.grk5_a, 'Grk5')
  assert.equal(m.grk5_b, 'Grk5 (2)')
})

test('autoMap assigns each source header at most once', () => {
  const m = autoMap(['nummer', 'naam'])
  const used = Object.values(m).filter(Boolean)
  assert.equal(new Set(used).size, used.length)
})

test('autoMap returns null for unknown fields', () => {
  const m = autoMap(['volstrekt onbekende kolom'])
  assert.equal(m.klantnummer, null)
})

test('applyMapping maps row and normalises status/empties', () => {
  const row = { Klant: '152', Omschrijving: ' AUTO CARS BV ', Actief: 'nee' }
  const mapping = { klantnummer: 'Klant', klantnaam: 'Omschrijving', status: 'Actief' }
  const out = applyMapping(row, mapping)
  assert.equal(out.klantnummer, '152')
  assert.equal(out.klantnaam, 'AUTO CARS BV')
  assert.equal(out.status, 'inactief')
  assert.equal(out.grk5_a, null)
})
