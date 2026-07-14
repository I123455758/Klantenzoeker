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

/** Grk-volgnummer uit een kop, bv. 'Grk1' of 'Grk1 (2)' -> 1; anders null. */
function grkNumber(raw) {
  const m = String(raw ?? '').match(/grk\s*(\d+)/i)
  return m ? Number(m[1]) : null
}

/** Heeft deze kolom (kop) minstens één niet-lege waarde in de voorbeeldrijen? */
function columnHasData(rows, header) {
  return rows.some((r) => {
    const v = r[header]
    return v != null && String(v).trim() !== ''
  })
}

/**
 * Data-bewuste verfijning van de twee groeperingscodes. Exports bevatten soms
 * Grk1..Grk5 waarvan alleen de eerste kolommen gevuld zijn; de kopgebaseerde
 * mapping kiest dan de (lege) Grk5. Als er voorbeeldrijen zijn verschuiven we
 * naar gevulde Grk-kolommen: grk5_a = de eerste gevulde Grk-kolom, grk5_b = een
 * gevulde kolom met een ander Grk-nummer (val terug op een andere gevulde kolom).
 * Een kopmatch die al data bevat blijft ongemoeid.
 * @param {Record<string, string|null>} mapping
 * @param {Array<{ raw: string }>} normed
 * @param {Array<Record<string, any>>} rows
 */
function refineGrkMapping(mapping, normed, rows) {
  if (!rows || !rows.length) return
  const grkCols = normed
    .map((h) => ({ raw: h.raw, num: grkNumber(h.raw) }))
    .filter((h) => h.num != null && columnHasData(rows, h.raw))
  if (!grkCols.length) return

  const aRaw =
    mapping.grk5_a && columnHasData(rows, mapping.grk5_a) ? mapping.grk5_a : grkCols[0].raw
  const aNum = grkNumber(aRaw)

  let bRaw =
    mapping.grk5_b && mapping.grk5_b !== aRaw && columnHasData(rows, mapping.grk5_b)
      ? mapping.grk5_b
      : null
  if (!bRaw) {
    const alt =
      grkCols.find((c) => c.raw !== aRaw && c.num !== aNum) ||
      grkCols.find((c) => c.raw !== aRaw)
    bRaw = alt ? alt.raw : null
  }

  mapping.grk5_a = aRaw
  mapping.grk5_b = bRaw
}

/**
 * Stel een automatische mapping voor: doelveld -> bronkop (of null).
 * Elke bronkop wordt hoogstens één keer toegewezen; exacte match gaat vóór deelmatch.
 * Als voorbeeldrijen worden meegegeven, worden de groeperingscodes data-bewust
 * verfijnd (zie refineGrkMapping) zodat lege Grk-kolommen niet gekozen worden.
 * @param {string[]} headers ruwe kopteksten uit het bestand
 * @param {Array<Record<string, any>>} [rows] optionele voorbeeldrijen (kop -> waarde)
 * @returns {Record<string, string|null>} bv. { klantnummer: 'Klantnr', klantnaam: 'Naam', ... }
 */
export function autoMap(headers, rows = []) {
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

  refineGrkMapping(mapping, normed, rows)
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
