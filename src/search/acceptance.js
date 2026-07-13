import { search } from './searchEngine.js'

/**
 * Acceptatietests voor de zoekmachine. Draait alle voorbeelden uit de bouwprompt
 * en controleert of de vaste fixtures (AUTO CARS BV / KL000152, René Dubois)
 * gevonden worden. Bedoeld om na het seeden even te draaien via IPC.
 */

/**
 * @typedef {Object} AcceptanceCase
 * @property {string} query zoekterm
 * @property {string} expectKlantnummer klantnummer dat in de top moet staan
 * @property {number} [topN] binnen hoeveel resultaten (standaard 10)
 * @property {string} [note] korte toelichting
 */

/** @type {AcceptanceCase[]} */
const CASES = [
  // AUTO CARS BV (KL000152) — substring, losse tokens, hoofdletterongevoelig
  { query: 'auto', expectKlantnummer: 'KL000152', topN: 50, note: 'substring begin' },
  { query: 'cars', expectKlantnummer: 'KL000152', topN: 50, note: 'substring midden' },
  { query: 'bv', expectKlantnummer: 'KL000152', topN: 200, note: 'kort token / rechtsvorm' },
  { query: 'auto cars', expectKlantnummer: 'KL000152', topN: 20, note: 'twee tokens (AND)' },
  { query: 'cars bv', expectKlantnummer: 'KL000152', topN: 20, note: 'twee tokens omgekeerd' },
  { query: 'uto', expectKlantnummer: 'KL000152', topN: 100, note: 'binnenin woord' },
  { query: 'ars', expectKlantnummer: 'KL000152', topN: 100, note: 'binnenin woord' },
  { query: 'AUTO', expectKlantnummer: 'KL000152', topN: 50, note: 'hoofdletters' },
  { query: 'Cars', expectKlantnummer: 'KL000152', topN: 50, note: 'gemengde case' },
  { query: 'AUTO CARS BV', expectKlantnummer: 'KL000152', topN: 5, note: 'volledige naam' },

  // Typotolerantie (fuzzy)
  { query: 'Aut Cars', expectKlantnummer: 'KL000152', topN: 20, note: 'typo/afkorting' },
  { query: 'Carss', expectKlantnummer: 'KL000152', topN: 20, note: 'dubbele letter' },
  { query: 'AutoCar', expectKlantnummer: 'KL000152', topN: 20, note: 'aaneengeschreven' },
  { query: 'Autto', expectKlantnummer: 'KL000152', topN: 50, note: 'ingevoegde letter' },

  // René Dubois (KL000777) — diacritiektolerantie
  { query: 'rene', expectKlantnummer: 'KL000777', topN: 50, note: 'zonder accent' },

  // Klantnummervarianten -> altijd KL000152
  { query: '152', expectKlantnummer: 'KL000152', topN: 20, note: 'cijfers zonder padding' },
  { query: '000152', expectKlantnummer: 'KL000152', topN: 20, note: 'met voorloopnullen' },
  { query: 'KL152', expectKlantnummer: 'KL000152', topN: 20, note: 'prefix zonder padding' },
  { query: 'KL000152', expectKlantnummer: 'KL000152', topN: 5, note: 'exact klantnummer' }
]

/**
 * Voer alle acceptatietests uit.
 * @returns {{ passed: number, failed: number, total: number, results: Array<{ query: string, ok: boolean, rank: number, tookMs: number, note?: string }> }}
 */
export function runAcceptance() {
  const results = []
  let passed = 0

  for (const c of CASES) {
    const topN = c.topN || 10
    const { rows, tookMs } = search(c.query, { offset: 0, limit: Math.max(topN, 50) })
    const rank = rows.findIndex((r) => r.klantnummer === c.expectKlantnummer)
    const ok = rank >= 0 && rank < topN
    if (ok) passed++
    results.push({ query: c.query, ok, rank: rank < 0 ? -1 : rank + 1, tookMs, note: c.note })
  }

  return { passed, failed: CASES.length - passed, total: CASES.length, results }
}
