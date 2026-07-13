import { normalize } from './normalize.js'

/**
 * Klantnummerlogica: normalisatie, patroondetectie en query-varianten.
 * Zo vindt `152`, `000152`, `KL152` en `KL000152` dezelfde klant `KL000152`.
 */

/**
 * Genormaliseerd klantnummer: hoofdletters, scheidingstekens (-, spaties, punten) weg.
 * @param {unknown} raw
 * @returns {string}
 */
export function klantnummerNorm(raw) {
  if (raw == null) return ''
  return String(raw)
    .toUpperCase()
    .replace(/[\s\-._/]/g, '')
    .trim()
}

/**
 * Enkel de cijfers, voorloopnullen verwijderd.
 * @param {unknown} raw
 * @returns {string}
 */
export function klantnummerDigits(raw) {
  if (raw == null) return ''
  const digits = String(raw).replace(/\D/g, '')
  const stripped = digits.replace(/^0+/, '')
  return stripped // '000152' -> '152', '000' -> ''
}

/**
 * Splits een genormaliseerd klantnummer in een letter-prefix en een numeriek deel.
 * @param {string} norm
 * @returns {{ prefix: string, digits: string }}
 */
export function splitPrefix(norm) {
  const m = /^([A-Z]*)(\d.*)?$/.exec(norm || '')
  if (!m) return { prefix: '', digits: '' }
  return { prefix: m[1] || '', digits: (m[2] || '').replace(/\D/g, '') }
}

/**
 * Detecteer het gemeenschappelijke klantnummerpatroon uit een steekproef.
 * @param {string[]} nummers ruwe klantnummers
 * @returns {{ prefix: string, digitLength: number, padded: boolean, sampleCount: number }}
 */
export function detectPattern(nummers) {
  const norms = nummers.map(klantnummerNorm).filter(Boolean)
  if (norms.length === 0) return { prefix: '', digitLength: 0, padded: false, sampleCount: 0 }

  // Gemeenschappelijke letter-prefix bepalen.
  const prefixes = norms.map((n) => splitPrefix(n).prefix)
  let common = prefixes[0]
  for (const p of prefixes) {
    let i = 0
    while (i < common.length && i < p.length && common[i] === p[i]) i++
    common = common.slice(0, i)
    if (!common) break
  }

  // Lengte van het numerieke deel (meest voorkomende).
  const lengths = {}
  for (const n of norms) {
    const d = splitPrefix(n).digits
    if (d) lengths[d.length] = (lengths[d.length] || 0) + 1
  }
  let digitLength = 0
  let best = -1
  for (const [len, cnt] of Object.entries(lengths)) {
    if (cnt > best) {
      best = cnt
      digitLength = Number(len)
    }
  }

  // Padding: bevatten numerieke delen voorloopnullen?
  const padded = norms.some((n) => /^\D*0\d/.test(n))

  return { prefix: common, digitLength, padded, sampleCount: norms.length }
}

/**
 * Bouw kandidaat-varianten voor een numeriek deel op basis van het patroon.
 * @param {string} digits cijfers zonder voorloopnullen
 * @param {{ digitLength?: number } | null} pattern
 * @returns {string[]} bv. ['152', '000152']
 */
export function paddedVariants(digits, pattern) {
  const out = new Set()
  if (!digits) return []
  out.add(digits)
  const len = pattern && pattern.digitLength ? pattern.digitLength : 0
  if (len > digits.length) out.add(digits.padStart(len, '0'))
  return [...out]
}

/**
 * Analyseer een zoektoken voor klantnummer-matching.
 * @param {string} token ruw token (niet genormaliseerd)
 * @returns {{ isCandidate: boolean, norm: string, prefix: string, digits: string }}
 */
export function analyzeToken(token) {
  const norm = klantnummerNorm(token)
  const { prefix, digits } = splitPrefix(norm)
  const strippedDigits = digits.replace(/^0+/, '')
  // Kandidaat als er cijfers in zitten (evt. met letter-prefix).
  const isCandidate = /\d/.test(norm)
  return { isCandidate, norm, prefix, digits: strippedDigits }
}
