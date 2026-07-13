<p align="center">
  <img src="build/icon.png" width="120" alt="Klantenzoeker" />
</p>

<h1 align="center">Klantenzoeker</h1>

<p align="center">
  Supersnelle, volledig lokale klantenzoeker voor Windows.<br/>
  Doorzoek 100.000+ klanten in enkele milliseconden — offline, alles in een lokale SQLite-database.
</p>

---

## Wat is dit?

Klantenzoeker is een Windows-desktoptoepassing (Electron) die aanvoelt als een
professioneel ERP-systeem, maar dan supersnel en zonder server. Alle gegevens
staan lokaal in een SQLite-database. De zoekbalk is het hart van de app:
substring-, hoofdletterongevoelig- en typotolerant zoeken over naam, klantnummer,
adres, btw-nummer, telefoon en e-mail.

De interface is volledig in het **Nederlands**.

## Functies

- **Bliksemsnel zoeken** — getrapte zoekmachine (klantnummer → strikte substring → fuzzy),
  resultaten in ~0–110 ms op 100k klanten, met caching voor directe vervolgpagina's.
- **Slim klantnummer** — `152`, `000152`, `KL152` en `KL000152` vinden allemaal dezelfde klant.
- **Typotolerantie** — `Carss`, `Autto`, `AutoCar` vinden nog steeds "Auto Cars BV".
- **Excel-import** met automatische kolomherkenning en **upsert** op klantnummer (nooit verwijderen).
- **PDF-import** — leidt klanten af uit een PDF-lijst, met voorbeeld en bevestiging.
- **Detailvenster** met bewerken en volledige **wijzigingshistoriek** per klant.
- **Export** naar Excel, CSV of PDF — exporteert exact je huidige zoekresultaten.
- **Startpagina** die nieuwe gebruikers naar import leidt bij een lege database.
- **Donkere modus**, instellingen en het beheren van meerdere databases.
- **Verdwenen klanten inactief markeren** — optioneel, standaard uit. Klanten worden
  nooit automatisch verwijderd.

## Snelstart (gebruiker)

1. Installeer via `Klantenzoeker-Setup-<versie>.exe`.
2. Start de app. Bij een lege database verschijnt de startpagina.
3. Klik op **Excel importeren** of **PDF importeren**, of genereer **testdata** om te proeven.
4. Typ in de zoekbalk. Dubbelklik een klant om te bekijken/bewerken.

## Ontwikkelen

Vereist Node.js 18+.

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
```

## Techniek

| Onderdeel        | Keuze                                                             |
| ---------------- | ---------------------------------------------------------------- |
| Runtime          | Electron (main / preload / renderer gescheiden)                  |
| Database         | better-sqlite3 (WAL, prepared statements, transacties)           |
| Zoeken           | SQLite FTS5 met **trigram**-tokenizer + JS-herrangschikking      |
| Tabel            | AG Grid Community (Infinite Row Model)                           |
| Import           | exceljs (Excel), pdfjs-dist (PDF)                                |
| Export           | exceljs (xlsx/csv), pdfkit (pdf)                                 |
| Bouwen           | electron-vite (dev) + electron-builder (NSIS)                    |

**Beveiliging:** `contextIsolation` aan, `nodeIntegration` uit, alle IPC via een
expliciete `contextBridge`-API met invoervalidatie, uitsluitend prepared statements.

## Projectstructuur

```
src/
  main/        Electron-hoofdproces (venster, lifecycle, IPC)
  preload/     Veilige contextBridge-API
  renderer/    UI (zoekbalk, grid, dialogen, startpagina)
  database/    schema, verbinding, repository, seed
  search/      normalisatie, klantnummer, levenshtein, zoekmachine, acceptatie
  import/      Excel- en PDF-import, kolommapping
  export/      export naar Excel/CSV/PDF
  utils/       logger, instellingen
build/         app-icoon (logo.svg, icon.png, icon.ico)
```

## Acceptatie

De zoekmachine wordt gedekt door een acceptatiemodule (`src/search/acceptance.js`)
met 19 voorbeelden uit de oorspronkelijke opdracht — substring, losse tokens,
hoofdletters, typefouten, diacritieken en klantnummervarianten. Draai ze in de app
via de knop **Tests**.

## Licentie

Privéproject. Alle rechten voorbehouden.
