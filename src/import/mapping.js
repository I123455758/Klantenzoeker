import { CUSTOMER_COLUMNS } from '../database/schema.js'

/**
 * Automatische kolomherkenning voor import. Koppelt willekeurige Excel-/PDF-koppen
 * aan onze vaste velden op basis van Nederlandse (en enkele Engelse) synoniemen.
 */

/** Synoniemen per doelveld (genormaliseerd: kleine letters, zonder scheidingstekens). */
const SYNONYMS = {
  klantnummer: ['klantnummer', 'klantnr', 'klantnrr', 'nummer', 'nr', 'klant', 'klantid', 'id', 'code', 'klantcode', 'debiteur', 'debiteurnummer', 'customernumber', 'customerid', 'accountnumber'],
  klantnaam: ['klantnaam', 'naam', 'bedrijf', 'bedrijfsnaam', 'firma', 'handelsnaam', 'organisatie', 'company', 'companyname', 'name', 'contact'],
  adres: ['adres', 'straat', 'straatnaam', 'straathuisnr', 'address', 'street', 'adreslijn'],
  postcode: ['postcode', 'pc', 'postnr', 'postalcode', 'zip', 'zipcode'],
  gemeente: ['gemeente', 'plaats', 'stad', 'woonplaats', 'city', 'plaatsnaam', 'town'],
  land: ['land', 'country', 'landcode'],
  btw_nummer: ['btw', 'btwnummer', 'btwnr', 'vat', 'vatnumber', 'ondernemingsnummer', 'kvk', 'kvknummer', 'tva'],
  telefoon: ['telefoon', 'tel', 'telnr', 'gsm', 'mobiel', 'phone', 'telephone', 'mobile', 'nummer telefoon'],
  email: ['email', 'emailadres', 'mail', 'mailadres', 'epost', 'emailaddress'],
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
