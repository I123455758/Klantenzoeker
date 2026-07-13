/**
 * SQLite-schema voor de klantenzoeker. Wordt idempotent uitgevoerd bij elke start.
 * FTS5 met trigram-tokenizer voor substring- én typotolerant zoeken.
 */

/** Alle vaste (getypeerde) kolommen van de customers-tabel, in UI/import-volgorde. */
export const CUSTOMER_COLUMNS = [
  'klantnummer',
  'klantnaam',
  'adres',
  'postcode',
  'gemeente',
  'land',
  'btw_nummer',
  'telefoon',
  'email',
  'status'
]

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  klantnummer        TEXT NOT NULL UNIQUE,
  klantnummer_norm   TEXT,
  klantnummer_digits TEXT,
  klantnaam          TEXT,
  adres              TEXT,
  postcode           TEXT,
  gemeente           TEXT,
  land               TEXT,
  btw_nummer         TEXT,
  telefoon           TEXT,
  email              TEXT,
  status             TEXT DEFAULT 'actief',
  search_blob        TEXT,
  extra_json         TEXT,
  pdf_pad            TEXT,
  created_at         TEXT DEFAULT (datetime('now')),
  updated_at         TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_klantnummer_norm   ON customers(klantnummer_norm);
CREATE INDEX IF NOT EXISTS idx_klantnummer_digits ON customers(klantnummer_digits);
CREATE INDEX IF NOT EXISTS idx_postcode           ON customers(postcode);
CREATE INDEX IF NOT EXISTS idx_status             ON customers(status);
CREATE INDEX IF NOT EXISTS idx_klantnaam          ON customers(klantnaam);

-- Substring + typotolerant zoeken via trigram-tokenizer.
CREATE VIRTUAL TABLE IF NOT EXISTS customers_fts USING fts5(
  search_blob,
  content='customers',
  content_rowid='id',
  tokenize='trigram'
);

-- Triggers houden de FTS-index synchroon met de customers-tabel.
CREATE TRIGGER IF NOT EXISTS customers_ai AFTER INSERT ON customers BEGIN
  INSERT INTO customers_fts(rowid, search_blob) VALUES (new.id, new.search_blob);
END;

CREATE TRIGGER IF NOT EXISTS customers_ad AFTER DELETE ON customers BEGIN
  INSERT INTO customers_fts(customers_fts, rowid, search_blob)
    VALUES ('delete', old.id, old.search_blob);
END;

CREATE TRIGGER IF NOT EXISTS customers_au AFTER UPDATE ON customers BEGIN
  INSERT INTO customers_fts(customers_fts, rowid, search_blob)
    VALUES ('delete', old.id, old.search_blob);
  INSERT INTO customers_fts(rowid, search_blob) VALUES (new.id, new.search_blob);
END;

-- Sleutel/waarde-metatabel voor patroon en app-status.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Wijzigingshistoriek voor het detailvenster.
CREATE TABLE IF NOT EXISTS historiek (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  veld        TEXT,
  oud         TEXT,
  nieuw       TEXT,
  changed_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_historiek_customer ON historiek(customer_id);
`
