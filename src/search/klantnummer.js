/**
 * Klantnummerlogica voor kale getallen (ADR 0001).
 * Klantnummers zijn gewone getallen (bv. `1379`), geen prefix of padding.
 * We houden alleen een simpele cijferextractie over voor nummer-zoeken.
 */

/**
 * Enkel de cijfers van een ruwe waarde, voorloopnullen verwijderd.
 * Zo vinden `152` en `000152` allebei klant `152`.
 * @param {unknown} raw
 * @returns {string}
 */
export function klantnummerDigits(raw) {
  if (raw == null) return ''
  const digits = String(raw).replace(/\D/g, '')
  return digits.replace(/^0+/, '') // '000152' -> '152', '000' -> ''
}
