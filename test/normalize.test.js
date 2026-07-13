import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize, tokenize, trigrams } from '../src/search/normalize.js'

test('normalize strips accents (diacritics)', () => {
  assert.equal(normalize('JIMÉNEZ'), 'jimenez')
  assert.equal(normalize('MAÑA'), 'mana')
  assert.equal(normalize('René Müller'), 'rene muller')
})

test('normalize lowercases', () => {
  assert.equal(normalize('AUTO CARS BV'), 'auto cars bv')
})

test('normalize collapses and trims whitespace', () => {
  assert.equal(normalize('  auto   cars   bv  '), 'auto cars bv')
})

test('normalize handles null/undefined/numbers', () => {
  assert.equal(normalize(null), '')
  assert.equal(normalize(undefined), '')
  assert.equal(normalize(152), '152')
})

test('tokenize splits on whitespace', () => {
  assert.deepEqual(tokenize('AUTO  CARS  BV'), ['auto', 'cars', 'bv'])
  assert.deepEqual(tokenize('   '), [])
})

test('trigrams', () => {
  assert.deepEqual(trigrams('auto'), ['aut', 'uto'])
  assert.deepEqual(trigrams('ab'), ['ab'])
  assert.deepEqual(trigrams(''), [])
})
