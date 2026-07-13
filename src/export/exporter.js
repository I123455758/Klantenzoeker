import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { createWriteStream, writeFileSync } from 'node:fs'
import { search } from '../search/searchEngine.js'
import { allCustomersOrdered } from '../database/queries.js'
import { logger } from '../utils/logger.js'

/**
 * Export van (gefilterde) klantgegevens naar Excel, CSV of PDF.
 * "Filterbewust": met een zoekterm exporteren we exact de gevonden resultaten,
 * zonder zoekterm de volledige klantenlijst.
 */

/** Exportkolommen met Nederlandse koppen, in vaste volgorde. */
const COLUMNS = [
  ['klantnummer', 'Klantnummer'],
  ['klantnaam', 'Klantnaam'],
  ['adres', 'Adres'],
  ['postcode', 'Postcode'],
  ['gemeente', 'Gemeente'],
  ['land', 'Land'],
  ['btw_nummer', 'Btw-nummer'],
  ['telefoon', 'Telefoon'],
  ['email', 'E-mail'],
  ['status', 'Status']
]

// Voor PDF een compactere kolomkeuze (past op een liggende pagina).
const PDF_COLUMNS = [
  ['klantnummer', 'Klantnr.', 70],
  ['klantnaam', 'Klantnaam', 150],
  ['postcode', 'Postcode', 55],
  ['gemeente', 'Gemeente', 90],
  ['telefoon', 'Telefoon', 80],
  ['email', 'E-mail', 150],
  ['status', 'Status', 55]
]

const PDF_MAX_ROWS = 5000 // PDF is niet bedoeld voor tienduizenden rijen

/**
 * Verzamel de te exporteren rijen voor een zoekterm.
 * @param {string} query lege string = volledige lijst
 * @returns {any[]}
 */
export function collectRows(query) {
  const q = (query || '').trim()
  if (!q) return allCustomersOrdered()
  // Gefilterd: de gerangschikte resultaten (zoals in het grid, tot de interne cap).
  return search(q, { offset: 0, limit: 1_000_000 }).rows
}

/** @param {any} v */
function cell(v) {
  return v == null ? '' : v
}

/**
 * Schrijf naar Excel (.xlsx).
 * @param {string} filePath @param {any[]} rows
 */
export async function writeXlsx(filePath, rows) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Klantenzoeker'
  wb.created = new Date()
  const ws = wb.addWorksheet('Klanten')
  ws.columns = COLUMNS.map(([field, header]) => ({
    header,
    key: field,
    width: field === 'klantnaam' || field === 'adres' || field === 'email' ? 28 : 16
  }))
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  for (const r of rows) {
    const obj = {}
    for (const [field] of COLUMNS) obj[field] = cell(r[field])
    ws.addRow(obj)
  }
  ws.autoFilter = { from: 'A1', to: { row: 1, column: COLUMNS.length } }
  await wb.xlsx.writeFile(filePath)
}

/**
 * Schrijf naar CSV (met UTF-8 BOM zodat Excel accenten juist toont).
 * @param {string} filePath @param {any[]} rows
 */
export function writeCsv(filePath, rows) {
  const esc = (v) => {
    const s = String(cell(v))
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = [COLUMNS.map(([, h]) => esc(h)).join(';')]
  for (const r of rows) {
    lines.push(COLUMNS.map(([field]) => esc(r[field])).join(';'))
  }
  writeFileSync(filePath, '﻿' + lines.join('\r\n'), 'utf-8')
}

/**
 * Schrijf naar PDF (liggend, eenvoudige tabel met paginering).
 * @param {string} filePath @param {any[]} rows @param {{ query?: string }} [meta]
 * @returns {Promise<void>}
 */
export function writePdf(filePath, rows, meta = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 })
    const stream = createWriteStream(filePath)
    stream.on('finish', resolve)
    stream.on('error', reject)
    doc.on('error', reject)
    doc.pipe(stream)

    const truncated = rows.length > PDF_MAX_ROWS
    const data = truncated ? rows.slice(0, PDF_MAX_ROWS) : rows

    const left = doc.page.margins.left
    const top = doc.page.margins.top
    const usableBottom = doc.page.height - doc.page.margins.bottom
    const rowH = 16

    const title =
      (meta.query ? `Klanten — zoekterm "${meta.query}"` : 'Klanten — volledige lijst') +
      `  (${rows.length}${truncated ? `, eerste ${PDF_MAX_ROWS} getoond` : ''})`

    function drawHeader(y) {
      doc.font('Helvetica-Bold').fontSize(9)
      let x = left
      for (const [, header, w] of PDF_COLUMNS) {
        doc.text(header, x + 2, y + 3, { width: w - 4, ellipsis: true })
        x += w
      }
      doc.moveTo(left, y + rowH).lineTo(x, y + rowH).stroke()
      doc.font('Helvetica').fontSize(8)
      return y + rowH
    }

    doc.font('Helvetica-Bold').fontSize(13).text(title, left, top)
    let y = top + 24
    y = drawHeader(y)

    for (const r of data) {
      if (y + rowH > usableBottom) {
        doc.addPage()
        y = doc.page.margins.top
        y = drawHeader(y)
      }
      let x = left
      for (const [field, , w] of PDF_COLUMNS) {
        doc.text(String(cell(r[field])), x + 2, y + 3, { width: w - 4, ellipsis: true, lineBreak: false })
        x += w
      }
      y += rowH
    }

    doc.end()
  })
}

/**
 * Exporteer rijen naar het gekozen bestand; formaat afgeleid van de extensie.
 * @param {string} filePath @param {any[]} rows @param {string} query
 * @returns {Promise<{ path: string, count: number, format: string }>}
 */
export async function exportRows(filePath, rows, query) {
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.') + 1)
  if (ext === 'xlsx') await writeXlsx(filePath, rows)
  else if (ext === 'csv') writeCsv(filePath, rows)
  else if (ext === 'pdf') await writePdf(filePath, rows, { query })
  else throw new Error(`Onbekend exportformaat: .${ext}`)
  logger.info('export', `Geëxporteerd: ${rows.length} rijen -> ${filePath}`)
  return { path: filePath, count: rows.length, format: ext }
}
