<p align="center">
  <img src="build/icon.png" width="112" alt="Klantenzoeker" />
</p>

<h1 align="center">Klantenzoeker</h1>

<p align="center">
  Blazing-fast, fully local customer search for Windows.<br/>
  Search 100,000+ customers in milliseconds — offline, everything in a local SQLite database.
</p>

<p align="center"><em><a href="README.md">🇳🇱 Nederlands</a> · 🇬🇧 English</em></p>

---

## What is this?

Klantenzoeker ("customer finder") is a Windows desktop application (Electron)
that feels like a professional ERP system, but blazing fast and without a server.
All data lives locally in a SQLite database. The search bar is the heart of the
app: substring, case-insensitive and typo-tolerant search over **customer name,
customer number and the two Grk5 grouping codes**.

The interface is entirely in **Dutch**.

### Data model

The data model follows the real export (ADR 0001) — four columns, not a rich
customer profile:

| Field | Meaning |
|-------|---------|
| `klantnummer` | Bare number (e.g. `1379`), unique key |
| `klantnaam` | Name / description |
| `grk5_a` | First Grk5 grouping code |
| `grk5_b` | Second Grk5 grouping code |
| `status` | `actief` (active) or `inactief` (inactive) |

## Features

- **Blazing-fast search** — tiered engine (customer number → strict substring → fuzzy),
  results in ~0–110 ms over 100k customers, with caching for instant follow-up pages.
- **Smart customer number** — bare numbers; `152` and `000152` both find the same customer.
- **Typo tolerance** — `Carss`, `Autto`, `AutoCar` still find "AUTO CARS BV".
- **Excel import** with automatic column detection (finds the real header row even
  with metadata rows above it) and **upsert** on customer number (never deletes).
- **PDF import** — derives customers from a PDF list, with preview and confirmation.
- **Statistics dashboard** — KPI cards: total, active, inactive and Grk5 groups.
- **Detail view** with editing and a full **change history** per customer.
- **Export** to Excel, CSV or PDF — exports exactly your current search results.
- **Dark mode**, settings, managing multiple databases and **clearing the database**.
- **Mark missing customers inactive** — optional, off by default. Customers are
  never deleted automatically.

## Quick start (user)

1. Install via `Klantenzoeker-Setup-<version>.exe`.
2. Launch the app. On an empty database the start page appears.
3. Click **Importeren** (Excel) or **PDF importeren**, or generate **testdata** to try it out.
4. Type in the search bar. Double-click a customer to view/edit.

## Development

Requires **Node.js 18+**.

```bash
npm install                 # dependencies
npm run rebuild             # rebuild better-sqlite3 for the Electron ABI
npm run dev                 # development mode (hot reload)
```

Other scripts:

```bash
npm run build               # production build to out/
npm start                   # run the built app (electron-vite preview)
npm run dist                # build the Windows NSIS installer to dist/
node --test                 # unit tests (normalize, klantnummer, mapping, derive, levenshtein)
```

## Tech

| Part | Choice |
| ---- | ------ |
| Runtime | Electron (main / preload / renderer separated) |
| Database | better-sqlite3 (WAL, prepared statements, transactions) |
| Search | SQLite FTS5 with **trigram** tokenizer + JS re-ranking |
| Table | AG Grid Community (Infinite Row Model, virtualised) |
| Import | exceljs (Excel), pdfjs-dist (PDF) |
| Export | exceljs (xlsx/csv), pdfkit (pdf) |
| Build | electron-vite (dev) + electron-builder (NSIS) |

## Project structure

```
src/
  main/        Electron main process (window, lifecycle, IPC)
  preload/     Secure contextBridge API
  renderer/    UI (sidebar, search bar, grid, dialogs, start page)
  database/    schema, connection, repository, seed
  search/      normalisation, customer number, levenshtein, engine, acceptance
  import/      Excel and PDF import, column mapping
  export/      export to Excel/CSV/PDF
  utils/       logger, settings
build/         app icon (logo.svg, icon.png, icon.ico)
test/          unit tests (node --test)
```

## Technical architecture

### Process model

The renderer has no direct access to Node, the file system or the database —
everything goes through `preload.js` (contextBridge → `window.api`). All database
access lives in the main process.

```
┌──────────────────────────────────────────────────────────────┐
│ RENDERER  (contextIsolation, no Node access)                  │
│   sidebar shell + search bar + AG Grid (infinite) + dialogs   │
└───────────────▲───────────────────────────┬──────────────────┘
                │ window.api (contextBridge)  │ ipcRenderer.invoke
                │  (request → response)       ▼
┌───────────────┴───────────────────────────────────────────────┐
│ PRELOAD  — narrow, explicit IPC bridge (input validation)      │
└───────────────▲───────────────────────────┬──────────────────┘
                │ ipcMain.handle              ▼
┌───────────────┴───────────────────────────────────────────────┐
│ MAIN  (Node)                                                   │
│   better-sqlite3 (WAL, FTS5 trigram) · search engine · import  │
│   export · seed · settings · logging                          │
└───────────────┬───────────────────┬───────────────────┬───────┘
                ▼                    ▼                    ▼
        klantenzoeker.db      export files         external files
```

### Data flow

1. **Import** — `analyzeImport()` opens a dialog and reads the workbook
   (`excel.js`); the header row is recognised by its columns (Klant + Omschrijving),
   metadata rows above are skipped. After column mapping, `runImport()` writes the
   rows via **upsert on customer number** (never deletes).
2. **Search** — the search bar calls `search()` → tiered engine (customer number →
   FTS5 trigram substring → fuzzy) → ranked rows that the virtualised AG Grid paginates.
3. **Statistics** — `stats()` feeds the KPI cards (total/active/inactive/groups).
4. **Detail** — double-click → `getCustomer()`; editing via `updateCustomer()`,
   which records every change in the **history**.
5. **Export** — `exportResults(query)` writes the current results to xlsx / csv / pdf.

### IPC channel reference

All channels are request → response (`ipcMain.handle`), offered through
`window.api`. `seed:progress` is the only event (main → renderer).

| Channel | `window.api` | Purpose |
|---------|--------------|---------|
| `search` | `search({query, offset, limit})` | Search with pagination |
| `customer:get` / `customer:getByKlantnummer` | `getCustomer(id)` / `getCustomerByKlantnummer(nr)` | Fetch one customer |
| `customer:update` | `updateCustomer(id, changes)` | Update customer (+ history) |
| `customer:historiek` | `getHistoriek(id)` | Change history |
| `stats` | `stats()` | Total/active/inactive/groups |
| `settings:getAll` / `settings:set` | `getSettings()` / `setSetting(k, v)` | Settings |
| `seed` (+ `seed:progress`) | `seed(count)` / `onSeedProgress(cb)` | Generate test data |
| `acceptance` | `acceptance()` | Run acceptance tests |
| `import:analyze` / `import:analyzePdf` | `analyzeImport()` / `analyzePdfImport()` | Pick file + mapping |
| `import:run` | `runImport(payload)` | Write import (upsert) |
| `export` | `exportResults(query)` | Export (xlsx/csv/pdf) |
| `db:open` / `db:new` / `db:clear` | `openDatabase()` / `newDatabase()` / `clearDatabase()` | Open/create/clear database |

## Security

`contextIsolation` on, `nodeIntegration` off, `sandbox` on. All IPC goes through
an explicit `contextBridge` API with input validation; the database is accessed
exclusively with **prepared statements** (no string concatenation in SQL). Database
initialisation is guarded with a clear error dialog.

## Tests

- **Unit tests** — `node --test` covers normalisation, customer number, column
  mapping, derived fields and Levenshtein.
- **Acceptance tests** — the search engine is covered by `src/search/acceptance.js`
  with 20 examples (substring, separate tokens, case, typos, diacritics and
  customer-number variants). Run them in the app via the **Tests** button.

## License

Private project. All rights reserved.
