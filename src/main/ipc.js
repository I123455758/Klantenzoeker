import { ipcMain, dialog, BrowserWindow } from 'electron'
import { openDatabase, defaultDbPath, closeDatabase } from '../database/connection.js'
import {
  countCustomers,
  getCustomerById,
  getCustomerByKlantnummer,
  updateCustomer,
  listHistoriek,
  getStatistics,
  deleteAllCustomers
} from '../database/queries.js'
import { search, clearCache, setFuzzyEnabled } from '../search/searchEngine.js'
import { seedDatabase } from '../database/seed.js'
import { runAcceptance } from '../search/acceptance.js'
import { readWorkbook } from '../import/excel.js'
import { autoMap } from '../import/mapping.js'
import { importRows } from '../import/importer.js'
import { analyzePdf } from '../import/pdf.js'
import { collectRows, exportRows } from '../export/exporter.js'
import { CUSTOMER_COLUMNS } from '../database/schema.js'
import { settings } from '../utils/settings.js'
import { logger } from '../utils/logger.js'

/** Laatst geanalyseerd importbestand (in geheugen), zodat 'run' niet opnieuw hoeft te parsen. */
let lastImport = null

/**
 * Registreer alle IPC-handlers. Alle invoer wordt gevalideerd; de renderer krijgt
 * uitsluitend via deze expliciete kanalen toegang tot database en zoekmachine.
 */

/** Maak van willekeurige invoer een veilig geheel getal binnen grenzen. */
function toInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** @param {import('electron').BrowserWindow} win */
export function registerIpc(win) {
  // --- Zoeken -------------------------------------------------------------
  ipcMain.handle('search', (_e, payload) => {
    const query = typeof payload?.query === 'string' ? payload.query : ''
    const offset = toInt(payload?.offset, 0, 0, 5_000_000)
    const limit = toInt(payload?.limit, 100, 1, 1000)
    return search(query, { offset, limit })
  })

  // --- Klantdetails -------------------------------------------------------
  ipcMain.handle('customer:get', (_e, id) => {
    const cid = toInt(id, -1, 0, Number.MAX_SAFE_INTEGER)
    if (cid < 0) return null
    return getCustomerById(cid)
  })

  ipcMain.handle('customer:getByKlantnummer', (_e, klantnummer) => {
    if (typeof klantnummer !== 'string' || !klantnummer.trim()) return null
    return getCustomerByKlantnummer(klantnummer.trim())
  })

  ipcMain.handle('customer:update', (_e, payload) => {
    const cid = toInt(payload?.id, -1, 0, Number.MAX_SAFE_INTEGER)
    if (cid < 0 || typeof payload?.changes !== 'object' || payload.changes === null) {
      throw new Error('Ongeldige invoer voor bijwerken')
    }
    const row = updateCustomer(cid, payload.changes)
    clearCache()
    return row
  })

  ipcMain.handle('customer:historiek', (_e, id) => {
    const cid = toInt(id, -1, 0, Number.MAX_SAFE_INTEGER)
    if (cid < 0) return []
    return listHistoriek(cid)
  })

  // --- Statistiek / status ------------------------------------------------
  ipcMain.handle('stats', () => ({
    ...getStatistics(),
    dbPath: settings.get('lastDbPath') || defaultDbPath()
  }))

  // --- Instellingen -------------------------------------------------------
  ipcMain.handle('settings:getAll', () => settings.getAll())

  ipcMain.handle('settings:set', (_e, payload) => {
    if (typeof payload?.key !== 'string') throw new Error('Ongeldige instelling')
    settings.set(payload.key, payload.value)
    if (payload.key === 'fuzzyEnabled') setFuzzyEnabled(payload.value !== false)
    return settings.getAll()
  })

  // --- Seed (dummydata) ---------------------------------------------------
  ipcMain.handle('seed', (_e, count) => {
    const n = toInt(count, 100000, 1, 2_000_000)
    const result = seedDatabase(n, (pct) => {
      if (!win.isDestroyed()) win.webContents.send('seed:progress', pct)
    })
    clearCache()
    return result
  })

  // --- Acceptatietests ----------------------------------------------------
  ipcMain.handle('acceptance', () => {
    clearCache()
    return runAcceptance()
  })

  // --- Excel-import -------------------------------------------------------
  ipcMain.handle('import:analyze', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Excel-bestand importeren',
      properties: ['openFile'],
      filters: [{ name: 'Excel-werkboek', extensions: ['xlsx'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null

    const filePath = res.filePaths[0]
    const sheets = await readWorkbook(filePath)
    lastImport = { filePath, sheets }

    // Alleen een lichte voorbeeldweergave terug naar de renderer.
    return {
      filePath,
      sheets: sheets.map((s) => ({
        name: s.name,
        headers: s.headers,
        rowCount: s.rowCount,
        sample: s.rows.slice(0, 8),
        mapping: autoMap(s.headers)
      }))
    }
  })

  ipcMain.handle('import:analyzePdf', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'PDF-bestand importeren',
      properties: ['openFile'],
      filters: [{ name: 'PDF-document', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null

    const filePath = res.filePaths[0]
    const { headers, rows } = await analyzePdf(filePath)
    // Bewaar als één "werkblad" zodat import:run ongewijzigd hergebruikt kan worden.
    lastImport = { filePath, sheets: [{ name: 'PDF', headers, rows, rowCount: rows.length }] }

    // Identiteitsmapping: de bronkoppen zijn al onze eigen veldnamen.
    const mapping = {}
    for (const f of CUSTOMER_COLUMNS) mapping[f] = headers.includes(f) ? f : null

    return {
      filePath,
      kind: 'pdf',
      sheets: [
        { name: 'PDF', headers, rowCount: rows.length, sample: rows.slice(0, 8), mapping }
      ]
    }
  })

  ipcMain.handle('import:run', (_e, payload) => {
    const filePath = typeof payload?.filePath === 'string' ? payload.filePath : ''
    const sheetName = typeof payload?.sheetName === 'string' ? payload.sheetName : ''
    const mapping = payload?.mapping
    if (!lastImport || lastImport.filePath !== filePath) {
      throw new Error('Geen geanalyseerd bestand meer in geheugen; importeer opnieuw.')
    }
    if (!mapping || typeof mapping !== 'object' || !mapping.klantnummer) {
      throw new Error('Koppel minstens de kolom "klantnummer" voordat je importeert.')
    }
    const sheet =
      lastImport.sheets.find((s) => s.name === sheetName) || lastImport.sheets[0]
    if (!sheet) throw new Error('Werkblad niet gevonden.')

    const result = importRows(sheet.rows, mapping, {
      markMissingInactive: payload?.markMissingInactive === true
    })
    lastImport = null // geheugen vrijgeven
    return result
  })

  // --- Export -------------------------------------------------------------
  ipcMain.handle('export', async (_e, payload) => {
    const query = typeof payload?.query === 'string' ? payload.query : ''
    const res = await dialog.showSaveDialog(win, {
      title: 'Exporteren',
      defaultPath: 'klanten-export.xlsx',
      filters: [
        { name: 'Excel-werkboek', extensions: ['xlsx'] },
        { name: 'CSV-bestand', extensions: ['csv'] },
        { name: 'PDF-document', extensions: ['pdf'] }
      ]
    })
    if (res.canceled || !res.filePath) return null
    const rows = collectRows(query)
    return exportRows(res.filePath, rows, query)
  })

  // --- Database openen / nieuwe maken ------------------------------------
  ipcMain.handle('db:open', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Database openen',
      properties: ['openFile'],
      filters: [{ name: 'SQLite-database', extensions: ['db', 'sqlite'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    openDatabase(res.filePaths[0])
    clearCache()
    return { dbPath: res.filePaths[0], total: countCustomers() }
  })

  ipcMain.handle('db:new', async () => {
    const res = await dialog.showSaveDialog(win, {
      title: 'Nieuwe database maken',
      defaultPath: 'klantenzoeker.db',
      filters: [{ name: 'SQLite-database', extensions: ['db'] }]
    })
    if (res.canceled || !res.filePath) return null
    openDatabase(res.filePath)
    clearCache()
    return { dbPath: res.filePath, total: countCustomers() }
  })

  // Leeg de huidige database (verwijder alle klanten). Vraagt eerst bevestiging.
  ipcMain.handle('db:clear', async () => {
    const res = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Annuleren', 'Alles verwijderen'],
      defaultId: 0,
      cancelId: 0,
      title: 'Database leegmaken',
      message: 'Alle klanten uit de huidige database verwijderen?',
      detail: 'Deze actie kan niet ongedaan worden gemaakt. Het databasebestand blijft bestaan, maar wordt leeggemaakt.'
    })
    if (res.response !== 1) return { ok: false, canceled: true }
    deleteAllCustomers()
    clearCache()
    return { ok: true, total: countCustomers() }
  })

  logger.info('ipc', 'IPC-handlers geregistreerd')
}

/** Verwijder handlers en sluit de database netjes af. */
export function teardownIpc() {
  for (const channel of [
    'search',
    'customer:get',
    'customer:getByKlantnummer',
    'customer:update',
    'customer:historiek',
    'stats',
    'settings:getAll',
    'settings:set',
    'seed',
    'acceptance',
    'import:analyze',
    'import:analyzePdf',
    'import:run',
    'export',
    'db:open',
    'db:new',
    'db:clear'
  ]) {
    ipcMain.removeHandler(channel)
  }
  closeDatabase()
}
