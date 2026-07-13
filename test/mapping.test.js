import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normHeader, autoMap, applyMapping } from '../src/import/mapping.js'

test('normHeader lowercases and strips non-alphanumerics', () => {
  assert.equal(normHeader('Klant-Nr.'), 'klantnr')
  assert.equal(normHeader('E-mailadres'), 'emailadres')
})

test('autoMap matches Dutch synonyms', () => {
  const m = autoMap(['Klantnr', 'Naam', 'Straat', 'Postcode', 'Plaats', 'Telefoon', 'E-mail'])
  assert.equal(m.klantnummer, 'Klantnr')
  assert.equal(m.klantnaam, 'Naam')
  assert.equal(m.adres, 'Straat')
  assert.equal(m.postcode, 'Postcode')
  assert.equal(m.gemeente, 'Plaats')
  assert.equal(m.telefoon, 'Telefoon')
  assert.equal(m.email, 'E-mail')
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
  const row = { Klantnr: '152', Naam: ' Auto Cars BV ', Actief: 'nee' }
  const mapping = { klantnummer: 'Klantnr', klantnaam: 'Naam', status: 'Actief' }
  const out = applyMapping(row, mapping)
  assert.equal(out.klantnummer, '152')
  assert.equal(out.klantnaam, 'Auto Cars BV')
  assert.equal(out.status, 'inactief')
  assert.equal(out.adres, null)
})
