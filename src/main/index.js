import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { openDatabase } from '../database/connection.js'
import { setFuzzyEnabled } from '../search/searchEngine.js'
import { registerIpc, teardownIpc } from './ipc.js'
import { settings } from '../utils/settings.js'
import { logger } from '../utils/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: settings.get('darkMode') ? '#1e1e1e' : '#ffffff',
    title: 'Klantenzoeker',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // preload heeft Node nodig voor het contextBridge-kanaal
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Externe links in de standaardbrowser openen, niet in het app-venster.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
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
  openDatabase()
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
