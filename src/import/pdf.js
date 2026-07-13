import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { logger } from '../utils/logger.js'

/**
 * PDF-import: tekst uit een PDF halen (pdfjs-dist) en er per regel een klant uit
 * afleiden met eenvoudige heuristieken. Bedoeld als "best effort" met voorbeeld;
 * de gebruiker bevestigt altijd voordat er wordt geïmporteerd.
 */

/**
 * Zoek het pad van de pdfjs-worker. Werkt zowel in ESM (import.meta.url) als in
 * de gebundelde CJS-main (echte require.resolve).
 * @returns {Promise<string|null>}
 */
async function resolveWorkerPath() {
  const spec = 'pdfjs-dist/legacy/build/pdf.worker.mjs'
  try {
    // eslint-disable-next-line no-undef
    if (typeof require !== 'undefined' && require.resolve) return require.resolve(spec)
  } catch {}
  try {
    const { createRequire } = await import('node:module')
    return createRequire(import.meta.url).resolve(spec)
  } catch (e) {
    logger.warn('import', 'Kon pdf-worker niet resolven: ' + e.message)
    return null
  }
}

/** Lazy import zodat pdfjs (zwaar) alleen laadt wanneer echt nodig. */
async function getPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // pdfjs vereist een workerSrc; in Node draait die als "fake worker" op de hoofdthread.
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const p = await resolveWorkerPath()
    if (p) pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(p).href
  }
  return pdfjs
}

/**
 * Haal tekstregels uit een PDF. Items worden per pagina op y-positie gegroepeerd
 * (regels) en binnen een regel op x-positie gesorteerd.
 * @param {string} filePath
 * @returns {Promise<string[]>} regels (over alle pagina's)
 */
export async function extractLines(filePath) {
  const pdfjs = await getPdfjs()
  const data = new Uint8Array(readFileSync(filePath))
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true
  }).promise

  const lines = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    /** @type {Map<number, Array<{ x: number, s: string }>>} */
    const byRow = new Map()
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue
      const x = item.transform[4]
      const y = Math.round(item.transform[5]) // y afronden om items op één regel te groeperen
      if (!byRow.has(y)) byRow.set(y, [])
      byRow.get(y).push({ x, s: item.str })
    }
    // Rijen van boven (hoge y) naar onder.
    const ys = [...byRow.keys()].sort((a, b) => b - a)
    for (const y of ys) {
      const parts = byRow.get(y).sort((a, b) => a.x - b.x)
      const text = parts.map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim()
      if (text) lines.push(text)
    }
  }
  await doc.cleanup()
  logger.info('import', `PDF gelezen: ${filePath} (${doc.numPages} pagina('s), ${lines.length} regels)`)
  return lines
}

const RE_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
const RE_BTW = /\bBE\s?0?\d{9,10}\b/i
const RE_POSTCITY = /\b(\d{4})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,40})$/
const RE_PHONE = /\b0\d{1,2}[\s./-]?\d{2,3}[\s./-]?\d{2}[\s./-]?\d{2,3}\b/
const RE_KLANT = /\b([A-Za-z]{1,4}\d{2,}|\d{3,})\b/

/** Verwijder de eerste match van een regex uit een string en geef {rest, match} terug. */
function pull(text, re) {
  const m = text.match(re)
  if (!m) return { rest: text, match: null }
  return { rest: (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim(), match: m }
}

/** Onze veldvolgorde voor PDF-afleiding. */
export const PDF_HEADERS = ['klantnummer', 'klantnaam', 'postcode', 'gemeente', 'btw_nummer', 'telefoon', 'email']

/**
 * Leid uit één regel een klantobject af. Retourneert null als er geen klantnummer is.
 * @param {string} line
 * @returns {Record<string, any> | null}
 */
export function parseLine(line) {
  let rest = line
  const out = {}

  const e = pull(rest, RE_EMAIL); rest = e.rest; if (e.match) out.email = e.match[0]
  const b = pull(rest, RE_BTW); rest = b.rest; if (b.match) out.btw_nummer = b.match[0].replace(/\s+/g, '')
  const pc = pull(rest, RE_POSTCITY)
  if (pc.match) {
    rest = pc.rest
    out.postcode = pc.match[1]
    out.gemeente = pc.match[2].trim()
  }
  const ph = pull(rest, RE_PHONE); rest = ph.rest; if (ph.match) out.telefoon = ph.match[0].replace(/\s+/g, '')
  const k = pull(rest, RE_KLANT); rest = k.rest; if (k.match) out.klantnummer = k.match[0]

  if (!out.klantnummer) return null

  const naam = rest.replace(/^[\s;,:|.-]+|[\s;,:|.-]+$/g, '').trim()
  if (naam) out.klantnaam = naam
  return out
}

/**
 * Parse alle regels naar klantobjecten (alleen regels met een klantnummer).
 * @param {string[]} lines
 * @param {string} [sourcePath] pad naar het bron-PDF (wordt als pdf_pad bewaard)
 * @returns {{ headers: string[], rows: Array<Record<string, any>> }}
 */
export function parseCustomers(lines, sourcePath) {
  const rows = []
  for (const line of lines) {
    const c = parseLine(line)
    if (!c) continue
    if (sourcePath) c._pdf_pad = sourcePath
    rows.push(c)
  }
  return { headers: PDF_HEADERS, rows }
}

/**
 * Volledige PDF-analyse: lezen + parsen.
 * @param {string} filePath
 * @returns {Promise<{ headers: string[], rows: Array<Record<string, any>> }>}
 */
export async function analyzePdf(filePath) {
  const lines = await extractLines(filePath)
  return parseCustomers(lines, filePath)
}
