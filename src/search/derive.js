import { normalize } from './normalize.js'

/**
 * Velden die meegaan in de zoek-blob (naam + groeperingscodes).
 * Volgorde bepaalt niets functioneel; enkel welke velden doorzoekbaar zijn.
 */
export const BLOB_FIELDS = ['klantnaam', 'grk5_a', 'grk5_b']

/**
 * Bereken het afgeleide zoekveld (search_blob) voor een klant.
 * Wordt gebruikt bij zowel seed als import, zodat de logica op één plek staat.
 *
 * @param {Record<string, any>} c klantobject met minstens `klantnummer`
 * @returns {{ search_blob: string }}
 */
export function computeDerived(c) {
  const parts = []
  // Klantnummer zelf ook doorzoekbaar maken (genormaliseerd).
  parts.push(normalize(c.klantnummer))
  for (const f of BLOB_FIELDS) {
    if (c[f] != null && c[f] !== '') parts.push(normalize(c[f]))
  }
  return { search_blob: parts.filter(Boolean).join(' ') }
}
