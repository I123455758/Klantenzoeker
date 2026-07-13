import { CUSTOMER_COLUMNS } from '../database/schema.js'

/**
 * Automatische kolomherkenning voor import. Koppelt willekeurige Excel-/PDF-koppen
 * aan onze vaste velden op basis van Nederlandse (en enkele Engelse) synoniemen.
 */

/**
 * Synoniemen per doelveld (genormaliseerd: kleine letters, zonder scheidingstekens).
 * Volgt het echte exportmodel (ADR 0001): Klant, Omschrijving en twee keer Grk5.
 * `excel.js` ontdubbelt de dubbele kop `Grk5` naar `Grk5` en `Grk5 (2)`, die
 * normaliseren naar `grk5` en `grk52` — daarom die twee als aparte synoniemen.
 */
const SYNONYMS = {
  klantnummer: ['klant', 'klantnummer', 'klantnr', 'nummer', 'nr', 'debiteur', 'debiteurnummer', 'code', 'klantcode'],
  klantnaam: ['omschrijving', 'klantnaam', 'naam', 'bedrijf', 'bedrijfsnaam', 'firma', 'handelsnaam', 'organisatie'],
  grk5_a: ['grk5', 'grk5a', 'groepering', 'groep', 'groeperingscode', 'grk'],
  grk5_b: ['grk52', 'grk5b', 'grk52e', 'groepering2', 'groep2'],
  status: ['status', 'actief', 'toestand', 'state']
}

/** Normaliseer een kopnaam voor vergelijking: kleine letters, alleen letters/cijfers. */
export function normHeader(h) {
  return String(h ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Stel een automatische mapping voor: doelveld -> bronkop (of null).
 * Elke bronkop wordt hoogstens één keer toegewezen; exacte match gaat vóór deelmatch.
 * @param {string[]} headers ruwe kopteksten uit het bestand
 * @returns {Record<string, string|null>} bv. { klantnummer: 'Klantnr', klantnaam: 'Naam', ... }
 */
export function autoMap(headers) {
  const normed = headers.map((h) => ({ raw: h, norm: normHeader(h) }))
  const used = new Set()
  const mapping = {}

  for (const field of CUSTOMER_COLUMNS) {
    const syns = SYNONYMS[field] || [field]
    let match = null

    // 1) exacte match op synoniem
    for (const s of syns) {
      const hit = normed.find((h) => !used.has(h.raw) && h.norm === s)
      if (hit) {
        match = hit.raw
        break
      }
    }
    // 2) deelmatch (kop bevat synoniem of omgekeerd), langste synoniem eerst
    if (!match) {
      for (const s of [...syns].sort((a, b) => b.length - a.length)) {
        if (s.length < 3) continue
        const hit = normed.find(
          (h) => !used.has(h.raw) && h.norm.length >= 3 && (h.norm.includes(s) || s.includes(h.norm))
        )
        if (hit) {
          match = hit.raw
          break
        }
      }
    }

    mapping[field] = match
    if (match) used.add(match)
  }

  return mapping
}

/**
 * Zet een ruwe bronrij (kop -> waarde) om naar een klantobject volgens de mapping.
 * @param {Record<string, any>} row bronrij
 * @param {Record<string, string|null>} mapping doelveld -> bronkop
 * @returns {Record<string, any>} klantobject met onze veldnamen
 */
export function applyMapping(row, mapping) {
  const out = {}
  for (const field of CUSTOMER_COLUMNS) {
    const src = mapping[field]
    let val = src ? row[src] : null
    if (typeof val === 'string') val = val.trim()
    out[field] = val === '' ? null : val
  }
  // Status normaliseren naar 'actief'/'inactief'.
  if (out.status != null) {
    const s = String(out.status).toLowerCase()
    out.status = /inact|inactief|non|0|nee|false/.test(s) ? 'inactief' : 'actief'
  }
  return out
}
