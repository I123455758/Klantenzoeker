import { search } from './searchEngine.js'

/**
 * Acceptatietests voor de zoekmachine. Draait alle voorbeelden uit ADR 0001
 * en controleert of de vaste fixtures (AUTO CARS BV / 152, JIMÉNEZ MAÑA
 * RECAMBIOS SRL / 777) gevonden worden. Bedoeld om na het seeden te draaien.
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
  // AUTO CARS BV (152) — substring, losse tokens, hoofdletterongevoelig
  { query: 'auto', expectKlantnummer: '152', topN: 50, note: 'substring begin' },
  { query: 'cars', expectKlantnummer: '152', topN: 50, note: 'substring midden' },
  { query: 'bv', expectKlantnummer: '152', topN: 200, note: 'kort token / rechtsvorm' },
  { query: 'auto cars', expectKlantnummer: '152', topN: 20, note: 'twee tokens (AND)' },
  { query: 'cars bv', expectKlantnummer: '152', topN: 20, note: 'twee tokens omgekeerd' },
  { query: 'uto', expectKlantnummer: '152', topN: 100, note: 'binnenin woord' },
  { query: 'ars', expectKlantnummer: '152', topN: 100, note: 'binnenin woord' },
  { query: 'AUTO', expectKlantnummer: '152', topN: 50, note: 'hoofdletters' },
  { query: 'Cars', expectKlantnummer: '152', topN: 50, note: 'gemengde case' },
  { query: 'AUTO CARS BV', expectKlantnummer: '152', topN: 5, note: 'volledige naam' },

  // Typotolerantie (fuzzy)
  { query: 'Aut Cars', expectKlantnummer: '152', topN: 20, note: 'typo/afkorting' },
  { query: 'Carss', expectKlantnummer: '152', topN: 20, note: 'dubbele letter' },
  { query: 'AutoCar', expectKlantnummer: '152', topN: 20, note: 'aaneengeschreven' },
  { query: 'Autto', expectKlantnummer: '152', topN: 50, note: 'ingevoegde letter' },

  // JIMÉNEZ MAÑA RECAMBIOS SRL (777) — diacritiektolerantie
  { query: 'jimenez', expectKlantnummer: '777', topN: 50, note: 'zonder accent' },
  { query: 'mana', expectKlantnummer: '777', topN: 50, note: 'ñ zonder accent' },
  { query: 'maña', expectKlantnummer: '777', topN: 50, note: 'met accent' },
  { query: 'recambios', expectKlantnummer: '777', topN: 50, note: 'derde woord' },

  // Klantnummervarianten -> altijd 152 (kale getallen)
  { query: '152', expectKlantnummer: '152', topN: 20, note: 'kaal nummer' },
  { query: '000152', expectKlantnummer: '152', topN: 20, note: 'met voorloopnullen' }
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
