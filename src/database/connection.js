import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'
import { SCHEMA_SQL } from './schema.js'
import { settings } from '../utils/settings.js'
import { logger } from '../utils/logger.js'

/**
 * Databaseverbinding (better-sqlite3). Synchroon, WAL-mode, één verbinding per app.
 */

/** @type {import('better-sqlite3').Database | null} */
let db = null

/** @returns {string} standaard db-pad in userData */
export function defaultDbPath() {
  return join(app.getPath('userData'), 'klantenzoeker.db')
}

/**
 * Open (of heropen) de database op het gegeven pad en pas het schema toe.
 * @param {string} [dbPath]
 * @returns {import('better-sqlite3').Database}
 */
export function openDatabase(dbPath) {
  const path = dbPath || settings.get('lastDbPath') || defaultDbPath()
  if (db) {
    try {
      db.close()
    } catch (e) {
      logger.warn('db', 'Sluiten oude verbinding mislukt:', e.message)
    }
    db = null
  }
  logger.info('db', 'Open database:', path)
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  settings.set('lastDbPath', path)
  return db
}

/** @returns {import('better-sqlite3').Database} */
export function getDb() {
  if (!db) return openDatabase()
  return db
}

export function closeDatabase() {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
      db.close()
    } catch (e) {
      logger.warn('db', 'Afsluiten mislukt:', e.message)
    }
    db = null
  }
}
