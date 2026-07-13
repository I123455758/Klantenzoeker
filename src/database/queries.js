import { getDb } from './connection.js'
import { computeDerived } from '../search/derive.js'
import { CUSTOMER_COLUMNS } from './schema.js'

/**
 * Repository met prepared statements. Alle DB-toegang loopt via dit bestand.
 * Statements worden lui voorbereid en gecachet zolang de verbinding leeft.
 */

let _db = null
let _stmts = null

function stmts() {
  const db = getDb()
  if (_db !== db) {
    _db = db
    _stmts = buildStatements(db)
  }
  return _stmts
}

function buildStatements(db) {
  const insertCols = [
    'klantnummer',
    'klantnummer_norm',
    'klantnummer_digits',
    'klantnaam',
    'adres',
    'postcode',
    'gemeente',
    'land',
    'btw_nummer',
    'telefoon',
    'email',
    'status',
    'search_blob',
    'extra_json',
    'pdf_pad'
  ]
  const placeholders = insertCols.map((c) => '@' + c).join(', ')

  // Upsert op klantnummer: bestaande bijwerken, nieuwe toevoegen. Nooit verwijderen.
  const upsertSql = `
    INSERT INTO customers (${insertCols.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(klantnummer) DO UPDATE SET
      klantnummer_norm   = excluded.klantnummer_norm,
      klantnummer_digits = excluded.klantnummer_digits,
      klantnaam          = excluded.klantnaam,
      adres              = excluded.adres,
      postcode           = excluded.postcode,
      gemeente           = excluded.gemeente,
      land               = excluded.land,
      btw_nummer         = excluded.btw_nummer,
      telefoon           = excluded.telefoon,
      email              = excluded.email,
      status             = excluded.status,
      search_blob        = excluded.search_blob,
      extra_json         = COALESCE(excluded.extra_json, customers.extra_json),
      updated_at         = datetime('now')
  `

  return {
    insert: db.prepare(
      `INSERT INTO customers (${insertCols.join(', ')}) VALUES (${placeholders})`
    ),
    upsert: db.prepare(upsertSql),
    getById: db.prepare('SELECT * FROM customers WHERE id = ?'),
    getByKlantnummer: db.prepare('SELECT * FROM customers WHERE klantnummer = ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM customers'),
    countActief: db.prepare("SELECT COUNT(*) AS n FROM customers WHERE status = 'actief'"),
    pageByName: db.prepare('SELECT * FROM customers ORDER BY klantnaam, id LIMIT ? OFFSET ?'),
    sampleKlantnummers: db.prepare('SELECT klantnummer FROM customers LIMIT ?'),
    metaGet: db.prepare('SELECT value FROM meta WHERE key = ?'),
    metaSet: db.prepare(
      'INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ),
    histInsert: db.prepare(
      'INSERT INTO historiek(customer_id, veld, oud, nieuw) VALUES (?, ?, ?, ?)'
    ),
    histList: db.prepare(
      'SELECT * FROM historiek WHERE customer_id = ? ORDER BY changed_at DESC, id DESC'
    ),
    deleteAll: db.prepare('DELETE FROM customers')
  }
}

/**
 * Normaliseer een klant tot het volledige rijobject inclusief afgeleide velden.
 * @param {Record<string, any>} c
 * @returns {Record<string, any>}
 */
export function toRow(c) {
  const derived = computeDerived(c)
  return {
    klantnummer: String(c.klantnummer ?? '').trim(),
    klantnaam: c.klantnaam ?? null,
    adres: c.adres ?? null,
    postcode: c.postcode ?? null,
    gemeente: c.gemeente ?? null,
    land: c.land ?? null,
    btw_nummer: c.btw_nummer ?? null,
    telefoon: c.telefoon ?? null,
    email: c.email ?? null,
    status: c.status ?? 'actief',
    extra_json: c.extra_json ?? null,
    pdf_pad: c.pdf_pad ?? null,
    ...derived
  }
}

/**
 * Voer een bulk-upsert uit in één transactie.
 * @param {Array<Record<string, any>>} customers
 * @returns {number} aantal verwerkte rijen
 */
export function bulkUpsert(customers) {
  const s = stmts()
  const run = getDb().transaction((list) => {
    for (const c of list) s.upsert.run(toRow(c))
    return list.length
  })
  return run(customers)
}

/**
 * Voer een bulk-insert uit (alleen voor seed/lege database).
 * @param {Array<Record<string, any>>} customers
 * @returns {number}
 */
export function bulkInsert(customers) {
  const s = stmts()
  const run = getDb().transaction((list) => {
    for (const c of list) s.insert.run(toRow(c))
    return list.length
  })
  return run(customers)
}

/** @param {number} id */
export function getCustomerById(id) {
  return stmts().getById.get(id)
}

/** @param {string} klantnummer */
export function getCustomerByKlantnummer(klantnummer) {
  return stmts().getByKlantnummer.get(klantnummer)
}

/** @returns {number} totaal aantal klanten */
export function countCustomers() {
  return stmts().count.get().n
}

/** @param {number} limit @param {number} offset */
export function pageAll(limit, offset) {
  return stmts().pageByName.all(limit, offset)
}

/** Alle klanten op naam gesorteerd (voor export zonder filter). @returns {any[]} */
export function allCustomersOrdered() {
  return getDb().prepare('SELECT * FROM customers ORDER BY klantnaam, id').all()
}

/** @param {number} n @returns {string[]} */
export function sampleKlantnummers(n = 500) {
  return stmts()
    .sampleKlantnummers.all(n)
    .map((r) => r.klantnummer)
}

/** @param {string} key @returns {string | null} */
export function metaGet(key) {
  const row = stmts().metaGet.get(key)
  return row ? row.value : null
}

/** @param {string} key @param {string} value */
export function metaSet(key, value) {
  stmts().metaSet.run(key, value)
}

/**
 * Werk één klant bij en registreer wijzigingen in de historiek.
 * @param {number} id
 * @param {Record<string, any>} changes velden uit CUSTOMER_COLUMNS
 * @returns {Record<string, any>} bijgewerkte rij
 */
export function updateCustomer(id, changes) {
  const db = getDb()
  const s = stmts()
  const tx = db.transaction(() => {
    const current = s.getById.get(id)
    if (!current) throw new Error(`Klant ${id} niet gevonden`)

    const editable = CUSTOMER_COLUMNS.filter((c) => c in changes)
    if (editable.length === 0) return current

    for (const veld of editable) {
      const oud = current[veld] ?? null
      const nieuw = changes[veld] ?? null
      if (String(oud ?? '') !== String(nieuw ?? '')) {
        s.histInsert.run(id, veld, oud == null ? null : String(oud), nieuw == null ? null : String(nieuw))
      }
    }

    const merged = { ...current, ...changes }
    const derived = computeDerived(merged)
    const setCols = [...editable, 'klantnummer_norm', 'klantnummer_digits', 'search_blob']
    const assignments = setCols.map((c) => `${c} = @${c}`).join(', ')
    db.prepare(
      `UPDATE customers SET ${assignments}, updated_at = datetime('now') WHERE id = @id`
    ).run({ ...merged, ...derived, id })

    return s.getById.get(id)
  })
  return tx()
}

/** @param {number} customerId */
export function listHistoriek(customerId) {
  return stmts().histList.all(customerId)
}

/** Verwijder alle klanten (voor "nieuwe database maken"). */
export function deleteAllCustomers() {
  stmts().deleteAll.run()
}

/**
 * Alle bestaande klantnummers als set (voor nieuw/bijgewerkt-classificatie bij import).
 * @returns {Set<string>}
 */
export function existingKlantnummerSet() {
  const rows = getDb().prepare('SELECT klantnummer FROM customers').all()
  return new Set(rows.map((r) => r.klantnummer))
}

/**
 * Markeer actieve klanten die NIET in de importlijst voorkomen als inactief.
 * Verwijdert nooit iets. Gebruikt een tijdelijke tabel i.p.v. een grote NOT IN-lijst.
 * @param {string[]} importedKlantnummers klantnummers die in de import zaten
 * @returns {number} aantal gemarkeerde klanten
 */
export function markMissingInactive(importedKlantnummers) {
  const db = getDb()
  const tx = db.transaction((list) => {
    db.exec('CREATE TEMP TABLE IF NOT EXISTS _import_seen (klantnummer TEXT PRIMARY KEY)')
    db.exec('DELETE FROM _import_seen')
    const ins = db.prepare('INSERT OR IGNORE INTO _import_seen(klantnummer) VALUES (?)')
    for (const k of list) if (k != null) ins.run(String(k))
    const res = db
      .prepare(
        `UPDATE customers SET status = 'inactief', updated_at = datetime('now')
         WHERE status = 'actief'
           AND klantnummer NOT IN (SELECT klantnummer FROM _import_seen)`
      )
      .run()
    db.exec('DROP TABLE _import_seen')
    return res.changes
  })
  return tx(importedKlantnummers)
}
