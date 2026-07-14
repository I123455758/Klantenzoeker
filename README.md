<p align="center">
  <img src="build/icon.png" width="112" alt="Klantenzoeker" />
</p>

<h1 align="center">Klantenzoeker</h1>

<p align="center">
  Supersnelle, volledig lokale klantenzoeker voor Windows.<br/>
  Doorzoek 100.000+ klanten in enkele milliseconden — offline, alles in een lokale SQLite-database.
</p>

<p align="center"><em>🇳🇱 Nederlands · <a href="README.en.md">🇬🇧 English</a></em></p>

---

## Wat is dit?

Klantenzoeker is een Windows-desktoptoepassing (Electron) die aanvoelt als een
professioneel ERP-systeem, maar dan supersnel en zonder server. Alle gegevens
staan lokaal in een SQLite-database. De zoekbalk is het hart van de app:
substring-, hoofdletterongevoelig- en typotolerant zoeken over **klantnaam,
klantnummer en de twee Grk5-groeperingscodes**.

De interface is volledig in het **Nederlands**.

### Gegevensmodel

Het datamodel volgt de echte export (ADR 0001) — vier kolommen, geen rijk
klantprofiel:

| Veld | Betekenis |
|------|-----------|
| `klantnummer` | Kaal getal (bv. `1379`), unieke sleutel |
| `klantnaam` | Naam / omschrijving |
| `grk5_a` | Eerste Grk5-groeperingscode |
| `grk5_b` | Tweede Grk5-groeperingscode |
| `status` | `actief` of `inactief` |

## Functies

- **Bliksemsnel zoeken** — getrapte zoekmachine (klantnummer → strikte substring → fuzzy),
  resultaten in ~0–110 ms op 100k klanten, met caching voor directe vervolgpagina's.
- **Slim klantnummer** — kale getallen; `152` en `000152` vinden allebei dezelfde klant.
- **Typotolerantie** — `Carss`, `Autto`, `AutoCar` vinden nog steeds "AUTO CARS BV".
- **Excel-import** met automatische kolomherkenning (herkent de echte koprij, ook
  met metadata-rijen erboven) en **upsert** op klantnummer (nooit verwijderen).
- **PDF-import** — leidt klanten af uit een PDF-lijst, met voorbeeld en bevestiging.
- **Statistiek-dashboard** — KPI-kaarten: totaal, actief, inactief en Grk5-groepen.
- **Detailvenster** met bewerken en volledige **wijzigingshistoriek** per klant.
- **Export** naar Excel, CSV of PDF — exporteert exact je huidige zoekresultaten.
- **Donkere modus**, instellingen, meerdere databases beheren en **database leegmaken**.
- **Verdwenen klanten inactief markeren** — optioneel, standaard uit. Klanten worden
  nooit automatisch verwijderd.

## Snelstart (gebruiker)

1. Installeer via `Klantenzoeker-Setup-<versie>.exe`.
2. Start de app. Bij een lege database verschijnt de startpagina.
3. Klik op **Importeren** (Excel) of **PDF importeren**, of genereer **testdata** om te proeven.
4. Typ in de zoekbalk. Dubbelklik een klant om te bekijken/bewerken.

## Ontwikkelen

Vereist **Node.js 18+**.

```bash
npm install                 # afhankelijkheden
npm run rebuild             # better-sqlite3 voor de Electron-ABI bouwen
npm run dev                 # ontwikkelmodus (hot reload)
```

Andere scripts:

```bash
npm run build               # productiebuild naar out/
npm start                   # gebouwde app draaien (electron-vite preview)
npm run dist                # Windows NSIS-installer bouwen naar dist/
node --test                 # unit-tests (normalize, klantnummer, mapping, derive, levenshtein)
```

## Techniek

| Onderdeel | Keuze |
| --------- | ----- |
| Runtime | Electron (main / preload / renderer gescheiden) |
| Vormgeving | Inter-typografie (lokaal ingesloten), licht/donker thema, design tokens |
| Database | better-sqlite3 (WAL, prepared statements, transacties) |
| Zoeken | SQLite FTS5 met **trigram**-tokenizer + JS-herrangschikking |
| Tabel | AG Grid Community (Infinite Row Model, gevirtualiseerd) |
| Import | exceljs (Excel), pdfjs-dist (PDF) |
| Export | exceljs (xlsx/csv), pdfkit (pdf) |
| Bouwen | electron-vite (dev) + electron-builder (NSIS) |

## Projectstructuur

```
src/
  main/        Electron-hoofdproces (venster, lifecycle, IPC)
  preload/     Veilige contextBridge-API
  renderer/    UI (sidebar, zoekbalk, grid, dialogen, startpagina)
  database/    schema, verbinding, repository, seed
  search/      normalisatie, klantnummer, levenshtein, zoekmachine, acceptatie
  import/      Excel- en PDF-import, kolommapping
  export/      export naar Excel/CSV/PDF
  utils/       logger, instellingen
build/         app-icoon (logo.svg, icon.png, icon.ico)
test/          unit-tests (node --test)
```

## Technische architectuur

### Procesmodel

De renderer heeft geen directe toegang tot Node, het bestandssysteem of de
database — alles loopt via `preload.js` (contextBridge → `window.api`). Alle
DB-toegang zit in het hoofdproces.

```
┌──────────────────────────────────────────────────────────────┐
│ RENDERER  (contextIsolation, geen Node-toegang)               │
│   sidebar-shell + zoekbalk + AG Grid (infinite) + dialogen    │
└───────────────▲───────────────────────────┬──────────────────┘
                │ window.api (contextBridge)  │ ipcRenderer.invoke
                │  (verzoek → antwoord)       ▼
┌───────────────┴───────────────────────────────────────────────┐
│ PRELOAD  — smalle, expliciete IPC-brug (invoervalidatie)       │
└───────────────▲───────────────────────────┬──────────────────┘
                │ ipcMain.handle              ▼
┌───────────────┴───────────────────────────────────────────────┐
│ MAIN  (Node)                                                   │
│   better-sqlite3 (WAL, FTS5-trigram) · zoekmachine · import    │
│   export · seed · instellingen · logging                      │
└───────────────┬───────────────────┬───────────────────┬───────┘
                ▼                    ▼                    ▼
        klantenzoeker.db      exportbestanden      externe bestanden
```

### Dataflow

1. **Import** — `analyzeImport()` opent een dialoog en leest het werkboek
   (`excel.js`); de koprij wordt herkend aan de kolommen (Klant + Omschrijving),
   metadata-rijen erboven worden overgeslagen. Na kolommapping schrijft
   `runImport()` de rijen weg via **upsert op klantnummer** (nooit verwijderen).
2. **Zoeken** — de zoekbalk roept `search()` aan → getrapte zoekmachine
   (klantnummer → FTS5-trigram substring → fuzzy) → gerangschikte rijen die het
   gevirtualiseerde AG Grid pagineert.
3. **Statistiek** — `stats()` levert de KPI-kaarten (totaal/actief/inactief/groepen).
4. **Detail** — dubbelklik → `getCustomer()`; bewerken via `updateCustomer()`,
   dat elke wijziging in de **historiek** vastlegt.
5. **Export** — `exportResults(query)` schrijft de huidige resultaten naar
   xlsx / csv / pdf.

### IPC-kanaalreferentie

Alle kanalen zijn verzoek → antwoord (`ipcMain.handle`), aangeboden via
`window.api`. `seed:progress` is het enige event (main → renderer).

| Kanaal | `window.api` | Doel |
|--------|--------------|------|
| `search` | `search({query, offset, limit})` | Zoeken met paginering |
| `customer:get` / `customer:getByKlantnummer` | `getCustomer(id)` / `getCustomerByKlantnummer(nr)` | Eén klant ophalen |
| `customer:update` | `updateCustomer(id, changes)` | Klant bijwerken (+ historiek) |
| `customer:historiek` | `getHistoriek(id)` | Wijzigingshistoriek |
| `stats` | `stats()` | Totaal/actief/inactief/groepen |
| `settings:getAll` / `settings:set` | `getSettings()` / `setSetting(k, v)` | Instellingen |
| `seed` (+ `seed:progress`) | `seed(count)` / `onSeedProgress(cb)` | Testdata genereren |
| `acceptance` | `acceptance()` | Acceptatietests draaien |
| `import:analyze` / `import:analyzePdf` | `analyzeImport()` / `analyzePdfImport()` | Bestand kiezen + mapping |
| `import:run` | `runImport(payload)` | Import wegschrijven (upsert) |
| `export` | `exportResults(query)` | Exporteren (xlsx/csv/pdf) |
| `db:open` / `db:new` / `db:clear` | `openDatabase()` / `newDatabase()` / `clearDatabase()` | Database openen/maken/leegmaken |

## Beveiliging

`contextIsolation` aan, `nodeIntegration` uit, `sandbox` aan. Alle IPC loopt via
een expliciete `contextBridge`-API met invoervalidatie; de database wordt
uitsluitend met **prepared statements** benaderd (geen string-concatenatie in SQL).
De database-initialisatie is afgeschermd met een nette foutmelding.

## Tests

- **Unit-tests** — `node --test` dekt normalisatie, klantnummer, kolommapping,
  afgeleide velden en Levenshtein.
- **Acceptatietests** — de zoekmachine wordt gedekt door `src/search/acceptance.js`
  met 20 voorbeelden (substring, losse tokens, hoofdletters, typefouten,
  diacritieken en klantnummervarianten). Draai ze in de app via de knop **Tests**.

## Licentie

Privéproject. Alle rechten voorbehouden.
