import { app, BrowserWindow, shell, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { openDatabase } from '../database/connection.js'
import { setFuzzyEnabled } from '../search/searchEngine.js'
import { registerIpc, teardownIpc } from './ipc.js'
import { settings } from '../utils/settings.js'
import { logger } from '../utils/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null

/** Vensterpictogram (voor dev; de gepackagede build gebruikt het exe-icoon). */
function windowIcon() {
  const p = join(app.getAppPath(), 'build', 'icon.png')
  return existsSync(p) ? p : undefined
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: settings.get('darkMode') ? '#1e1e1e' : '#ffffff',
    title: 'Klantenzoeker',
    icon: windowIcon(),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // De preload gebruikt uitsluitend contextBridge + ipcRenderer; die zijn ook
      // in een sandboxed preload beschikbaar. Sandbox aan = strengste isolatie.
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Externe links in de standaardbrowser openen, niet in het app-venster.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Navigatie weg van de eigen renderer blokkeren (defense-in-depth tegen
  // per ongeluk of kwaadwillig openen van externe URLs in het app-venster).
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL()
    if (url !== current) {
      event.preventDefault()
      if (/^https?:/i.test(url)) shell.openExternal(url)
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  registerIpc(mainWindow)
}

app.whenReady().then(() => {
  // Database en zoekinstellingen initialiseren vóór het venster.
  // Faalt dit (bijv. native module-mismatch, vergrendeld of beschadigd
  // db-bestand), toon dan een begrijpelijke melding i.p.v. een stille crash.
  try {
    openDatabase()
  } catch (e) {
    logger.error('app', 'Database openen mislukt:', e.message)
    dialog.showErrorBox(
      'Database kon niet worden geopend',
      'Klantenzoeker kon de database niet openen en wordt afgesloten.\n\n' +
        `Oorzaak: ${e.message}\n\n` +
        'Controleer of het databasebestand niet in gebruik of beschadigd is, ' +
        'of maak via het menu een nieuwe database aan.'
    )
    app.quit()
    return
  }
  setFuzzyEnabled(settings.get('fuzzyEnabled') !== false)
  logger.info('app', 'Klantenzoeker gestart')

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  teardownIpc()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  teardownIpc()
})
