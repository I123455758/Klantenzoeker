import ExcelJS from 'exceljs'
import { logger } from '../utils/logger.js'

/**
 * Lees een Excel-bestand (.xlsx) in met exceljs. Elk werkblad wordt omgezet naar
 * kopteksten + rijen (objecten kop -> waarde). De eerste niet-lege rij is de kop.
 */

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

/**
 * Lees alle werkbladen uit een bestand.
 * @param {string} filePath
 * @returns {Promise<Array<{ name: string, headers: string[], rows: Array<Record<string, any>>, rowCount: number }>>}
 */
export async function readWorkbook(filePath) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const sheets = []

  wb.eachSheet((ws) => {
    // Zoek de eerste rij met inhoud als koprij.
    let headerRowNumber = 0
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      if (headerRowNumber === 0) {
        const vals = row.values.filter((x) => x != null && String(x).trim() !== '')
        if (vals.length > 0) headerRowNumber = rn
      }
    })
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
