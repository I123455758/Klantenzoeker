import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { logger } from './logger.js'

/**
 * Eenvoudige, afhankelijkheidsvrije instellingen-opslag als JSON-bestand in userData.
 * Vervangt electron-store om ESM/CJS-problemen te vermijden en houdt alles lokaal.
 */

const DEFAULTS = {
  darkMode: false,
  lastDbPath: null,
  columnState: null, // AG Grid kolomvolgorde/-breedtes
  markMissingInactive: false, // "verdwenen klanten inactief markeren" (standaard uit)
  klantnummerPattern: null // gedetecteerd patroon (prefix, lengte, padding)
}

let cache = null
let filePath = null

function getPath() {
  if (!filePath) filePath = join(app.getPath('userData'), 'settings.json')
  return filePath
}

function loadAll() {
  if (cache) return cache
  try {
    const p = getPath()
    cache = existsSync(p)
      ? { ...DEFAULTS, ...JSON.parse(readFileSync(p, 'utf-8')) }
      : { ...DEFAULTS }
  } catch (err) {
    logger.warn('settings', 'Kon instellingen niet laden, gebruik standaardwaarden:', err.message)
    cache = { ...DEFAULTS }
  }
  return cache
}

function persist() {
  try {
    writeFileSync(getPath(), JSON.stringify(cache, null, 2), 'utf-8')
  } catch (err) {
    logger.error('settings', 'Kon instellingen niet opslaan:', err.message)
  }
}

export const settings = {
  /** @param {string} key */
  get(key) {
    return loadAll()[key]
  },
  getAll() {
    return { ...loadAll() }
  },
  /** @param {string} key @param {any} value */
  set(key, value) {
    loadAll()
    cache[key] = value
    persist()
  },
  /** @param {Record<string, any>} obj */
  merge(obj) {
    loadAll()
    Object.assign(cache, obj)
    persist()
  }
}
