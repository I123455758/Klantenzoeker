import { contextBridge, ipcRenderer } from 'electron'

/**
 * Veilige, expliciete brug tussen renderer en main. De renderer krijgt geen
 * directe toegang tot Node of de database — alleen deze afgebakende methodes.
 */

const api = {
  /** @param {{ query: string, offset?: number, limit?: number }} params */
  search: (params) => ipcRenderer.invoke('search', params),

  /** @param {number} id */
  getCustomer: (id) => ipcRenderer.invoke('customer:get', id),
  /** @param {string} klantnummer */
  getCustomerByKlantnummer: (klantnummer) =>
    ipcRenderer.invoke('customer:getByKlantnummer', klantnummer),
  /** @param {number} id @param {Record<string, any>} changes */
  updateCustomer: (id, changes) => ipcRenderer.invoke('customer:update', { id, changes }),
  /** @param {number} id */
  getHistoriek: (id) => ipcRenderer.invoke('customer:historiek', id),

  stats: () => ipcRenderer.invoke('stats'),

  /** Lijst van bedrijven (aparte database per firma) + het actieve bedrijf. */
  listCompanies: () => ipcRenderer.invoke('company:list'),
  /** Wissel naar de database van een bedrijf. @param {string} code */
  setCompany: (code) => ipcRenderer.invoke('company:set', code),

  getSettings: () => ipcRenderer.invoke('settings:getAll'),
  /** @param {string} key @param {any} value */
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),

  /** @param {number} [count] */
  seed: (count) => ipcRenderer.invoke('seed', count),
  /** @param {(pct: number) => void} cb */
  onSeedProgress: (cb) => {
    const listener = (_e, pct) => cb(pct)
    ipcRenderer.on('seed:progress', listener)
    return () => ipcRenderer.removeListener('seed:progress', listener)
  },

  acceptance: () => ipcRenderer.invoke('acceptance'),

  /** Kies een Excel-bestand en krijg werkbladen + automatische kolommapping terug. */
  analyzeImport: () => ipcRenderer.invoke('import:analyze'),
  /** Kies een PDF-bestand en krijg de afgeleide klantrijen + mapping terug. */
  analyzePdfImport: () => ipcRenderer.invoke('import:analyzePdf'),
  /** @param {{ filePath: string, sheetName: string, mapping: Record<string, string|null>, markMissingInactive: boolean }} payload */
  runImport: (payload) => ipcRenderer.invoke('import:run', payload),

  /** Exporteer de huidige (gefilterde) resultaten; formaat volgt uit de gekozen extensie. */
  exportResults: (query) => ipcRenderer.invoke('export', { query }),

  openDatabase: () => ipcRenderer.invoke('db:open'),
  newDatabase: () => ipcRenderer.invoke('db:new'),
  /** Leeg de huidige database (vraagt in main om bevestiging). */
  clearDatabase: () => ipcRenderer.invoke('db:clear')
}

contextBridge.exposeInMainWorld('api', api)
