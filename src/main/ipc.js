import { ipcMain, dialog, BrowserWindow } from 'electron'
import { openDatabase, defaultDbPath, closeDatabase } from '../database/connection.js'
import {
  countCustomers,
  getCustomerById,
  getCustomerByKlantnummer,
  updateCustomer,
  listHistoriek
} from '../database/queries.js'
import { search, clearCache, setFuzzyEnabled } from '../search/searchEngine.js'
import { seedDatabase } from '../database/seed.js'
import { runAcceptance } from '../search/acceptance.js'
import { settings } from '../utils/settings.js'
import { logger } from '../utils/logger.js'

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
    total: countCustomers(),
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
    'db:open',
    'db:new'
  ]) {
    ipcMain.removeHandler(channel)
  }
  closeDatabase()
}
