import { normalize } from './normalize.js'
import { klantnummerNorm, klantnummerDigits } from './klantnummer.js'

/**
 * Velden die meegaan in de zoek-blob (naam + adres + contact).
 * Volgorde bepaalt niets functioneel; enkel welke velden doorzoekbaar zijn.
 */
export const BLOB_FIELDS = [
  'klantnaam',
  'adres',
  'postcode',
  'gemeente',
  'land',
  'btw_nummer',
  'telefoon',
  'email'
]

/**
 * Bereken de afgeleide velden (search_blob + klantnummer-varianten) voor een klant.
 * Wordt gebruikt bij zowel seed als import, zodat de logica op één plek staat.
 *
 * @param {Record<string, any>} c klantobject met minstens `klantnummer`
 * @returns {{ search_blob: string, klantnummer_norm: string, klantnummer_digits: string }}
 */
export function computeDerived(c) {
  const parts = []
  // Klantnummer zelf ook doorzoekbaar maken (genormaliseerd).
  parts.push(normalize(c.klantnummer))
  for (const f of BLOB_FIELDS) {
    if (c[f] != null && c[f] !== '') parts.push(normalize(c[f]))
  }
  return {
    search_blob: parts.filter(Boolean).join(' '),
    klantnummer_norm: klantnummerNorm(c.klantnummer),
    klantnummer_digits: klantnummerDigits(c.klantnummer)
  }
}
