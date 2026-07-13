import { test } from 'node:test'
import assert from 'node:assert/strict'
import { levenshtein, similarity } from '../src/search/levenshtein.js'

test('levenshtein distance', () => {
  assert.equal(levenshtein('', ''), 0)
  assert.equal(levenshtein('abc', 'abc'), 0)
  assert.equal(levenshtein('kitten', 'sitting'), 3)
  assert.equal(levenshtein('abc', ''), 3)
  assert.equal(levenshtein('jimenez', 'jimemez'), 1)
})

test('similarity is 0..1 and symmetric-ish', () => {
  assert.equal(similarity('', ''), 1)
  assert.equal(similarity('abc', 'abc'), 1)
  const s = similarity('kitten', 'sitting')
  assert.ok(s > 0 && s < 1)
  assert.equal(similarity('abc', 'xyz'), 0)
})
