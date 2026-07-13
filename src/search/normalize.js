/**
 * Centrale normalisatie voor hoofdletter- en accentongevoelig zoeken.
 *
 * Stappen:
 *  1. Unicode NFKD → diacritische tekens strippen (René → rene).
 *  2. lowercase.
 *  3. Overtollige spaties samenvouwen + trim.
 *
 * @param {unknown} text
 * @returns {string}
 */
export function normalize(text) {
  if (text == null) return ''
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // combineerbare accenten (diacritische tekens)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Splits een genormaliseerde zoekterm in tokens (op witruimte).
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  const n = normalize(text)
  return n ? n.split(' ').filter(Boolean) : []
}

/**
 * Bereken de trigrammen (3-tekengroepen) van een string.
 * Gebruikt voor fuzzy/typotolerante scoring.
 * @param {string} s
 * @returns {string[]}
 */
export function trigrams(s) {
  const t = normalize(s)
  if (t.length < 3) return t ? [t] : []
  const out = []
  for (let i = 0; i <= t.length - 3; i++) out.push(t.slice(i, i + 3))
  return out
}
