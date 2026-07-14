import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { logger } from '../utils/logger.js'

/**
 * Lees een Excel-bestand (.xlsx) in met exceljs. Elk werkblad wordt omgezet naar
 * kopteksten + rijen (objecten kop -> waarde). De koprij is de rij die de
 * verwachte kolommen (Klant + Omschrijving) bevat — niet zomaar de eerste
 * niet-lege rij, want de echte export heeft metadata-rijen erboven.
 *
 * Sommige boekhoudpakketten exporteren een ".xls" dat in werkelijkheid HTML is
 * (een <table>, geen echt Excel-binair/xlsx-bestand). Zulke bestanden herkennen
 * we aan de eerste bytes en lezen we via de HTML-tabelparser hieronder, zodat de
 * downstream mapping/import identiek blijft werken.
 */

/** Kolomnamen die samen de echte koprij markeren (genormaliseerd, kleine letters). */
const HEADER_KEYS = ['klant', 'omschrijving']

/** Zet een exceljs-cel om naar een eenvoudige string/nummerwaarde. */
function cellValue(cell) {
  const v = cell.value
  if (v == null) return null
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text) // rich text / hyperlink
    if (v.result != null) return v.result // formule-resultaat
    if (v.hyperlink != null) return String(v.hyperlink)
    if (v instanceof Date) return v
    return String(v)
  }
  return v
}

/** Normaliseer een ruwe celwaarde tot kleine-letters-tekst voor koprijherkenning. */
function headerText(v) {
  if (v == null) return ''
  if (typeof v === 'object') {
    if (v.text != null) v = v.text
    else if (v.result != null) v = v.result
    else return ''
  }
  return String(v).toLowerCase().trim()
}

/**
 * Lees alle werkbladen uit een bestand.
 * @param {string} filePath
 * @returns {Promise<Array<{ name: string, headers: string[], rows: Array<Record<string, any>>, rowCount: number }>>}
 */
export async function readWorkbook(filePath) {
  // ".xls" dat eigenlijk HTML is (export uit boekhoud-/ERP-software) herkennen
  // aan de eerste bytes en apart afhandelen; exceljs kan zulke bestanden niet lezen.
  const head = readFileSync(filePath).subarray(0, 1024).toString('latin1').toLowerCase()
  if (head.includes('<html') || head.includes('<table')) {
    const sheets = readHtmlWorkbook(filePath)
    logger.info('import', `HTML-werkboek gelezen: ${filePath} (${sheets.length} tabel(len))`)
    return sheets
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const sheets = []

  wb.eachSheet((ws) => {
    // Zoek de ECHTE koprij: de rij die de verwachte kolommen bevat (Klant +
    // Omschrijving). Zo worden metadata-rijen erboven (titel, bedrijfsnaam,
    // exportdatum) overgeslagen. Valt terug op de eerste niet-lege rij als die
    // kop niet gevonden wordt, zodat andere bestanden blijven werken.
    let headerRowNumber = 0
    let firstNonEmpty = 0
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      const texts = (row.values || []).map(headerText).filter(Boolean)
      if (texts.length === 0) return
      if (firstNonEmpty === 0) firstNonEmpty = rn
      if (headerRowNumber === 0 && HEADER_KEYS.every((k) => texts.includes(k))) {
        headerRowNumber = rn
      }
    })
    if (headerRowNumber === 0) headerRowNumber = firstNonEmpty
    if (headerRowNumber === 0) {
      sheets.push({ name: ws.name, headers: [], rows: [], rowCount: 0 })
      return
    }

    const headerRow = ws.getRow(headerRowNumber)
    /** @type {Array<{ col: number, name: string }>} */
    const cols = []
    const seen = new Map()
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      let name = String(cellValue(cell) ?? '').trim()
      if (!name) name = `Kolom ${colNumber}`
      // Dubbele koppen ontdubbelen zodat elke kop uniek is.
      if (seen.has(name)) {
        const n = seen.get(name) + 1
        seen.set(name, n)
        name = `${name} (${n})`
      } else {
        seen.set(name, 1)
      }
      cols.push({ col: colNumber, name })
    })

    const headers = cols.map((c) => c.name)
    const rows = []
    for (let rn = headerRowNumber + 1; rn <= ws.rowCount; rn++) {
      const row = ws.getRow(rn)
      const obj = {}
      let hasValue = false
      for (const { col, name } of cols) {
        const val = cellValue(row.getCell(col))
        obj[name] = val
        if (val != null && String(val).trim() !== '') hasValue = true
      }
      if (hasValue) rows.push(obj)
    }

    sheets.push({ name: ws.name, headers, rows, rowCount: rows.length })
  })

  logger.info('import', `Werkboek gelezen: ${filePath} (${sheets.length} werkblad(en))`)
  return sheets
}

/** Decodeer de HTML-entiteiten die in deze exports voorkomen. */
function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

/** Strip tags uit één cel en normaliseer witruimte. */
function htmlCellText(inner) {
  return decodeEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/**
 * Bouw één sheet (headers + rij-objecten) uit een matrix van celstrings.
 * Gebruikt dezelfde koprijherkenning en kop-ontdubbeling als de exceljs-tak.
 * @param {string} name
 * @param {string[][]} matrix
 */
function buildSheetFromMatrix(name, matrix) {
  // Zoek de ECHTE koprij (bevat 'klant' én 'omschrijving'); val terug op de
  // eerste niet-lege rij zodat andere bestanden blijven werken.
  let headerIdx = -1
  let firstNonEmpty = -1
  matrix.forEach((row, i) => {
    const texts = row.map((v) => String(v ?? '').toLowerCase().trim()).filter(Boolean)
    if (texts.length === 0) return
    if (firstNonEmpty === -1) firstNonEmpty = i
    if (headerIdx === -1 && HEADER_KEYS.every((k) => texts.includes(k))) headerIdx = i
  })
  // matched = echte koprij (Klant + Omschrijving) gevonden, geen terugval.
  const matched = headerIdx !== -1
  if (headerIdx === -1) headerIdx = firstNonEmpty
  if (headerIdx === -1) return { name, headers: [], rows: [], rowCount: 0, matched: false }

  const seen = new Map()
  const cols = matrix[headerIdx].map((raw, c) => {
    let nm = String(raw ?? '').trim()
    if (!nm) nm = `Kolom ${c + 1}`
    if (seen.has(nm)) {
      const n = seen.get(nm) + 1
      seen.set(nm, n)
      nm = `${nm} (${n})`
    } else {
      seen.set(nm, 1)
    }
    return { col: c, name: nm }
  })

  const headers = cols.map((c) => c.name)
  const rows = []
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const obj = {}
    let hasValue = false
    for (const { col, name } of cols) {
      const val = matrix[i][col] ?? null
      obj[name] = val === '' ? null : val
      if (val != null && String(val).trim() !== '') hasValue = true
    }
    if (hasValue) rows.push(obj)
  }
  return { name, headers, rows, rowCount: rows.length, matched }
}

/**
 * Lees een als-".xls"-vermomd HTML-bestand: elke <table> wordt een kandidaat-sheet.
 * Deze exports bevatten naast de klantentabel ook een metadata-tabel (Bedrijf,
 * Boekhouding, …). We houden daarom bij voorkeur alleen de tabel(len) met een
 * echte koprij (Klant + Omschrijving) over; is die er niet, dan vallen we terug
 * op alle niet-lege tabellen zodat afwijkende bestanden toch iets tonen.
 * @param {string} filePath
 * @returns {Array<{ name: string, headers: string[], rows: Array<Record<string, any>>, rowCount: number }>}
 */
function readHtmlWorkbook(filePath) {
  const html = readFileSync(filePath, 'utf8')
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1])
  const matrices = tables.map((tbl) =>
    [...tbl.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((tr) =>
      [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => htmlCellText(c[1]))
    )
  )
  const bedrijfRaw = findBedrijf(matrices)
  const sheets = []
  matrices.forEach((matrix, ti) => {
    const sheet = buildSheetFromMatrix(`Tabel ${ti + 1}`, matrix)
    if (sheet.headers.length && sheet.rowCount > 0) sheets.push(sheet)
  })
  const real = sheets.filter((s) => s.matched)
  const chosen = real.length ? real : sheets
  // interne 'matched'-vlag niet lekken; het gedetecteerde bedrijf wel meesturen.
  return chosen.map(({ matched, ...s }) => ({ ...s, bedrijfRaw }))
}

/**
 * Zoek de ruwe waarde van het "Bedrijf"-veld in de metadata-tabellen
 * (kop-waardeparen zoals "Bedrijf | VWE VAN WEZEL AUTOPARTS NV").
 * @param {string[][][]} matrices
 * @returns {string | null}
 */
function findBedrijf(matrices) {
  for (const matrix of matrices) {
    for (const row of matrix) {
      if (row.length >= 2 && /^bedrijf$/i.test(String(row[0]).trim())) {
        const v = String(row[1] ?? '').trim()
        if (v) return v
      }
    }
  }
  return null
}
