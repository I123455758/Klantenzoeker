import { bulkUpsert, existingKlantnummerSet, markMissingInactive } from '../database/queries.js'
import { clearCache } from '../search/searchEngine.js'
import { applyMapping } from './mapping.js'
import { logger } from '../utils/logger.js'

/**
 * Verwerk geïmporteerde rijen naar de database via upsert op klantnummer.
 * Klanten worden nooit verwijderd; "verdwenen" klanten worden alleen inactief
 * gemarkeerd als de gebruiker dat expliciet aanvinkt.
 */

/**
 * @param {Array<Record<string, any>>} sourceRows ruwe rijen (kop -> waarde)
 * @param {Record<string, string|null>} mapping doelveld -> bronkop
 * @param {{ markMissingInactive?: boolean }} [opts]
 * @returns {{ total: number, inserted: number, updated: number, skipped: number, marked: number }}
 */
export function importRows(sourceRows, mapping, opts = {}) {
  const existing = existingKlantnummerSet()

  const customers = []
  const seenKlantnummers = []
  const seenSet = new Set()
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const raw of sourceRows) {
    const c = applyMapping(raw, mapping)
    if (raw._pdf_pad) c.pdf_pad = raw._pdf_pad // herkomst bewaren bij PDF-import
    const klantnummer = c.klantnummer == null ? '' : String(c.klantnummer).trim()
    if (!klantnummer) {
      skipped++ // zonder klantnummer kunnen we niet upserten
      continue
    }
    c.klantnummer = klantnummer

    // Classificeer nieuw vs. bijgewerkt (dubbele klantnummers in het bestand tellen één keer).
    if (!seenSet.has(klantnummer)) {
      seenSet.add(klantnummer)
      seenKlantnummers.push(klantnummer)
      if (existing.has(klantnummer)) updated++
      else inserted++
    }
    customers.push(c)
  }

  if (customers.length) bulkUpsert(customers)

  let marked = 0
  if (opts.markMissingInactive) {
    marked = markMissingInactive(seenKlantnummers)
  }

  clearCache()
  const result = { total: sourceRows.length, inserted, updated, skipped, marked }
  logger.info('import', 'Import klaar: ' + JSON.stringify(result))
  return result
}
