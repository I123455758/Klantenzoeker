import { getDb } from '../database/connection.js'
import { countCustomers, pageAll } from '../database/queries.js'
import { normalize, tokenize, trigrams } from './normalize.js'
import { klantnummerDigits } from './klantnummer.js'
import { similarity } from './levenshtein.js'

/**
 * Getrapte zoekmachine: klantnummer → strikte substring (FTS trigram) → fuzzy.
 * Resultaten worden in JS herrangschikt voor een ERP-gevoel en per query gecachet
 * zodat het virtuele grid opeenvolgende pagina's stabiel en snel kan ophalen.
 */

const CANDIDATE_CAP = 2000 // max. rijen die we materialiseren/herrangschikken
const FUZZY_THRESHOLD = 0.34 // minimale trigram-gelijkenis voor een fuzzy-treffer
const FUZZY_TRIGGER = 40 // draai fuzzy pas als strikte treffers hieronder blijven

let fuzzyEnabled = true

/** Zet de (uitschakelbare) fuzzy-module aan/uit. @param {boolean} on */
export function setFuzzyEnabled(on) {
  fuzzyEnabled = !!on
}

/** @type {{ query: string, rows: any[], matchTotal: number } | null} */
let cache = null

/**
 * Publieke zoekfunctie met paginering.
 * @param {string} query
 * @param {{ offset?: number, limit?: number }} [opts]
 * @returns {{ rows: any[], total: number, matchTotal: number, tookMs: number, browse: boolean }}
 */
export function search(query, opts = {}) {
  const t0 = Date.now()
  const offset = Math.max(0, opts.offset || 0)
  const limit = Math.max(1, opts.limit || 100)
  const q = normalize(query)

  // Lege zoekterm → bladermodus (alle klanten op naam), rechtstreeks gepagineerd.
  if (!q) {
    const total = countCustomers()
    const rows = pageAll(limit, offset)
    return { rows, total, matchTotal: total, tookMs: Date.now() - t0, browse: true }
  }

  if (!cache || cache.query !== q) {
    cache = { query: q, ...computeResults(q) }
  }
  const rows = cache.rows.slice(offset, offset + limit)
  return {
    rows,
    total: cache.rows.length,
    matchTotal: cache.matchTotal,
    tookMs: Date.now() - t0,
    browse: false
  }
}

/** Wis de resultaatcache (bv. na import/upsert). */
export function clearCache() {
  cache = null
}

/**
 * Bereken de volledige, gerangschikte resultatenlijst voor een zoekterm (tot CANDIDATE_CAP).
 * @param {string} q genormaliseerde zoekterm
 * @returns {{ rows: any[], matchTotal: number }}
 */
function computeResults(q) {
  const tokens = tokenize(q)
  const byId = new Map() // id -> { row, score }

  // ---- Tier 1: klantnummerlogica ----------------------------------------
  for (const raw of tokens) {
    const digits = klantnummerDigits(raw)
    if (!digits) continue
    for (const hit of klantnummerMatches(digits)) {
      const prev = byId.get(hit.row.id)
      if (!prev || hit.score > prev.score) byId.set(hit.row.id, hit)
    }
  }

  // ---- Tier 2: strikte substring (FTS trigram + LIKE) -------------------
  const strict = strictSearch(tokens)
  for (const row of strict.rows) {
    const score = scoreRow(row, q, tokens, row.__bm25)
    const prev = byId.get(row.id)
    if (!prev || score > prev.score) byId.set(row.id, { row, score })
  }
  let matchTotal = strict.total

  // ---- Tier 3: fuzzy / typotolerantie (optioneel) ----------------------
  if (fuzzyEnabled && byId.size < FUZZY_TRIGGER) {
    const before = byId.size
    for (const hit of fuzzySearch(tokens)) {
      if (byId.has(hit.row.id)) continue
      byId.set(hit.row.id, hit)
    }
    matchTotal += byId.size - before
  }

  const rows = [...byId.values()]
    .sort((a, b) => b.score - a.score || collate(a.row.klantnaam, b.row.klantnaam))
    .slice(0, CANDIDATE_CAP)
    .map((x) => x.row)

  return { rows, matchTotal: Math.max(matchTotal, rows.length) }
}

/** Nederlandse/naam-sortering als tiebreaker. */
function collate(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'nl')
}

/**
 * Zoek klanten via klantnummer (exact + contains op het kale getal).
 * @param {string} digits kale cijferreeks (zonder voorloopnullen)
 * @returns {Array<{ row: any, score: number }>}
 */
function klantnummerMatches(digits) {
  const db = getDb()
  const out = []
  const seen = new Set()
  const add = (row, score) => {
    if (!row || seen.has(row.id)) return
    seen.add(row.id)
    out.push({ row, score })
  }
  if (!digits) return out

  // Exact op het kale klantnummer (voorloopnullen zijn al verwijderd).
  add(db.prepare('SELECT * FROM customers WHERE klantnummer = ?').get(digits), 100000)
  // Contains: klantnummer bevat de cijferreeks.
  for (const r of db
    .prepare('SELECT * FROM customers WHERE klantnummer LIKE ? LIMIT 100')
    .all('%' + digits + '%')) {
    add(r, 60000)
  }
  return out
}

/**
 * Strikte substring-zoekopdracht: alle tokens moeten voorkomen (AND).
 * Tokens ≥ 3 tekens via FTS5-trigram (MATCH), korte tokens via LIKE.
 * @param {string[]} tokens
 * @returns {{ rows: any[], total: number }}
 */
function strictSearch(tokens) {
  const db = getDb()
  const long = tokens.filter((t) => t.length >= 3)
  const short = tokens.filter((t) => t.length < 3)

  if (long.length === 0 && short.length === 0) return { rows: [], total: 0 }

  const where = []
  const params = []

  if (long.length) {
    const match = long.map((t) => `"${t.replace(/"/g, '""')}"`).join(' ')
    where.push('customers_fts MATCH ?')
    params.push(match)
  }
  for (const s of short) {
    where.push('c.search_blob LIKE ?')
    params.push('%' + s + '%')
  }

  const from = long.length
    ? 'FROM customers_fts JOIN customers c ON c.id = customers_fts.rowid'
    : 'FROM customers c'
  const rankExpr = long.length ? 'bm25(customers_fts)' : '0'
  const whereSql = where.join(' AND ')

  const total = db.prepare(`SELECT COUNT(*) AS n ${from} WHERE ${whereSql}`).get(...params).n
  const rows = db
    .prepare(`SELECT c.*, ${rankExpr} AS __bm25 ${from} WHERE ${whereSql} ORDER BY __bm25 LIMIT ?`)
    .all(...params, CANDIDATE_CAP)

  return { rows, total }
}

/**
 * Bereken een rangschikkingsscore voor een strikte treffer.
 * exacte veld-match > prefix-match > woord-match > alle-tokens-aanwezig > bm25.
 * @param {any} row
 * @param {string} q genormaliseerde volledige zoekterm
 * @param {string[]} tokens
 * @param {number} [bm25] lager = beter (negatief in SQLite)
 * @returns {number}
 */
function scoreRow(row, q, tokens, bm25) {
  let score = 100 // basis: alle tokens aanwezig
  const name = normalize(row.klantnaam)
  const blob = row.search_blob || ''

  if (name && name === q) score += 5000 // exacte naam-match
  else if (name && name.startsWith(q)) score += 1500 // prefix op naam

  const nameWords = name ? name.split(' ') : []
  for (const tok of tokens) {
    if (nameWords.includes(tok)) score += 60 // volledig woord in naam
    else if (name.includes(tok)) score += 25 // deel van naam
    else if (blob.includes(tok)) score += 8 // elders in de gegevens
  }

  if (typeof bm25 === 'number' && bm25 !== 0) score += -bm25 // FTS-relevantie
  return score
}

/**
 * Fuzzy zoeken: trigram-overlap via FTS (OR) + herrangschikking met gelijkenis.
 * @param {string[]} tokens
 * @returns {Array<{ row: any, score: number }>}
 */
function fuzzySearch(tokens) {
  const db = getDb()
  const long = tokens.filter((t) => t.length >= 3)
  if (long.length === 0) return []

  // Verzamel alle trigrammen van de (lange) tokens en OR ze in de MATCH-query.
  const triSet = new Set()
  for (const t of long) for (const g of trigrams(t)) triSet.add(g)
  if (triSet.size === 0) return []

  const match = [...triSet].map((g) => `"${g.replace(/"/g, '""')}"`).join(' OR ')
  const candidates = db
    .prepare(
      `SELECT c.*, bm25(customers_fts) AS __bm25
       FROM customers_fts JOIN customers c ON c.id = customers_fts.rowid
       WHERE customers_fts MATCH ? ORDER BY __bm25 LIMIT ?`
    )
    .all(match, CANDIDATE_CAP)

  const out = []
  for (const row of candidates) {
    const words = (row.search_blob || '').split(' ')
    let sum = 0
    let ok = true
    for (const tok of long) {
      const best = bestWordSimilarity(tok, words)
      if (best < FUZZY_THRESHOLD) {
        ok = false
        break
      }
      sum += best
    }
    if (!ok) continue
    const avg = sum / long.length
    // Fuzzy scoort onder strikte treffers maar boven niets.
    out.push({ row, score: 40 + avg * 40 })
  }
  return out
}

/**
 * Beste gelijkenis tussen een token en de woorden van een rij (trigram-Dice + Levenshtein).
 * @param {string} token
 * @param {string[]} words
 * @returns {number} 0..1
 */
function bestWordSimilarity(token, words) {
  const tTri = new Set(trigrams(token))
  let best = 0
  for (const w of words) {
    if (!w) continue
    // Substring is een zekere treffer.
    if (w.includes(token) || token.includes(w)) return 1
    const wTri = trigrams(w)
    if (wTri.length === 0) continue
    let overlap = 0
    for (const g of wTri) if (tTri.has(g)) overlap++
    const dice = (2 * overlap) / (tTri.size + wTri.length)
    // Combineer met Levenshtein-gelijkenis (typotolerantie) — losse module.
    const lev = similarity(token, w)
    const s = Math.max(dice, lev * 0.9)
    if (s > best) best = s
  }
  return best
}
