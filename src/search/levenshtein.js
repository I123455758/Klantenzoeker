/**
 * Losse, uitschakelbare module voor typotolerantie.
 * Levenshtein-afstand + genormaliseerde gelijkenis (0..1).
 * Wordt gebruikt om de top-N fuzzy-kandidaten te herrangschikken.
 */

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} bewerkafstand
 */
export function levenshtein(a, b) {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  let prev = new Array(n + 1)
  let cur = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    cur[0] = i
    const ai = a.charCodeAt(i - 1)
    for (let j = 1; j <= n; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    const tmp = prev
    prev = cur
    cur = tmp
  }
  return prev[n]
}

/**
 * Gelijkenis 0..1 op basis van Levenshtein (1 = identiek).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function similarity(a, b) {
  if (!a && !b) return 1
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}
