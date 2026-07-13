import { createGrid } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import './style.css'

/**
 * Renderer: snelle zoekbalk + AG Grid (Infinite Row Model) + statusbalk.
 * Alle data komt via het veilige `window.api`-kanaal uit de main-process.
 */

const $ = (id) => document.getElementById(id)
const searchInput = $('search')
const statusEl = $('status')
const timingEl = $('timing')
const gridDiv = $('grid')

let currentQuery = ''
let lastMeta = { tookMs: 0, matchTotal: 0, browse: true, total: 0 }

const nlNumber = new Intl.NumberFormat('nl-BE')

/** Kolomdefinities in ERP-volgorde. */
const columnDefs = [
  { headerName: 'Klantnr.', field: 'klantnummer', width: 120 },
  { headerName: 'Klantnaam', field: 'klantnaam', flex: 2, minWidth: 200 },
  { headerName: 'Adres', field: 'adres', flex: 2, minWidth: 180 },
  { headerName: 'Postcode', field: 'postcode', width: 110 },
  { headerName: 'Gemeente', field: 'gemeente', flex: 1, minWidth: 130 },
  { headerName: 'Btw-nummer', field: 'btw_nummer', width: 150 },
  { headerName: 'Telefoon', field: 'telefoon', width: 140 },
  { headerName: 'E-mail', field: 'email', flex: 1, minWidth: 180 },
  {
    headerName: 'Status',
    field: 'status',
    width: 100,
    cellClass: (p) => (p.value === 'inactief' ? 'inactief' : '')
  }
]

/** Infinite-model datasource: haalt blokken op via de zoekmachine. */
const datasource = {
  async getRows(params) {
    const startRow = params.startRow
    const limit = params.endRow - params.startRow
    try {
      const res = await window.api.search({ query: currentQuery, offset: startRow, limit })
      lastMeta = res
      // lastRow zorgt dat het grid stopt met verder pagineren op het einde.
      const lastRow = res.total
      params.successCallback(res.rows, lastRow)
      updateStatus()
    } catch (err) {
      console.error('Zoeken mislukt:', err)
      params.failCallback()
      statusEl.textContent = 'Fout bij zoeken: ' + (err?.message || err)
    }
  }
}

const gridOptions = {
  columnDefs,
  rowModelType: 'infinite',
  cacheBlockSize: 100,
  maxBlocksInCache: 20,
  infiniteInitialRowCount: 1,
  rowSelection: 'single',
  datasource,
  defaultColDef: {
    resizable: true,
    sortable: false,
    suppressHeaderMenuButton: true
  },
  getRowId: (p) => String(p.data.id),
  onRowDoubleClicked: (e) => {
    if (e.data) openDetail(e.data.id)
  }
}

const gridApi = createGrid(gridDiv, gridOptions)

/** Werk de statusbalk bij op basis van de laatste zoekopdracht. */
function updateStatus() {
  const { tookMs, matchTotal, browse, total } = lastMeta
  if (browse) {
    statusEl.textContent = `${nlNumber.format(total)} klanten (bladeren)`
  } else {
    const capped = total >= 2000 ? '+' : ''
    statusEl.textContent = `${nlNumber.format(total)}${capped} resultaten voor "${currentQuery}"`
  }
  timingEl.textContent = `${tookMs} ms`
}

/** Herlaad het grid volledig na een nieuwe zoekterm of databron. */
function reload() {
  gridApi.setGridOption('datasource', datasource)
}

// --- Zoekbalk met debounce --------------------------------------------------
let debounceTimer = null
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    currentQuery = searchInput.value
    reload()
  }, 90)
})

$('clear').addEventListener('click', () => {
  searchInput.value = ''
  currentQuery = ''
  searchInput.focus()
  reload()
})

// --- Donkere modus ----------------------------------------------------------
function applyDark(on) {
  document.body.classList.toggle('dark', on)
  gridDiv.classList.toggle('ag-theme-alpine', !on)
  gridDiv.classList.toggle('ag-theme-alpine-dark', on)
}

$('btn-dark').addEventListener('click', async () => {
  const on = !document.body.classList.contains('dark')
  applyDark(on)
  await window.api.setSetting('darkMode', on)
})

// --- Testdata (seed) --------------------------------------------------------
async function runSeed() {
  const btn = $('btn-seed')
  btn.disabled = true
  const stop = window.api.onSeedProgress((pct) => {
    statusEl.textContent = `Testdata genereren… ${pct}%`
  })
  try {
    const res = await window.api.seed(100000)
    statusEl.textContent = `Testdata klaar: ${nlNumber.format(res.total)} klanten`
    reload()
    await refreshEmptyState()
  } catch (err) {
    statusEl.textContent = 'Seed mislukt: ' + (err?.message || err)
  } finally {
    stop()
    btn.disabled = false
  }
}
$('btn-seed').addEventListener('click', runSeed)

// --- Acceptatietests --------------------------------------------------------
$('btn-accept').addEventListener('click', async () => {
  statusEl.textContent = 'Acceptatietests draaien…'
  try {
    const r = await window.api.acceptance()
    const fails = r.results.filter((x) => !x.ok)
    console.table(r.results)
    if (r.failed === 0) {
      statusEl.textContent = `✅ Alle ${r.total} acceptatietests geslaagd`
    } else {
      statusEl.textContent =
        `⚠️ ${r.passed}/${r.total} geslaagd — mislukt: ` +
        fails.map((f) => `"${f.query}"`).join(', ')
    }
  } catch (err) {
    statusEl.textContent = 'Tests mislukt: ' + (err?.message || err)
  }
})

// --- Export -----------------------------------------------------------------
$('btn-export').addEventListener('click', async () => {
  const btn = $('btn-export')
  btn.disabled = true
  statusEl.textContent = 'Exporteren…'
  try {
    const res = await window.api.exportResults(currentQuery)
    if (!res) {
      statusEl.textContent = 'Export geannuleerd.'
      return
    }
    statusEl.textContent = `Geëxporteerd: ${nlNumber.format(res.count)} klanten naar ${res.format.toUpperCase()} (${res.path})`
  } catch (err) {
    statusEl.textContent = 'Export mislukt: ' + (err?.message || err)
  } finally {
    btn.disabled = false
  }
})

// --- Detailvenster (bekijken/bewerken + historiek) --------------------------
/** Bewerkbare velden met label en type. klantnummer blijft de sleutel (alleen-lezen). */
const DETAIL_FIELDS = [
  { field: 'klantnummer', label: 'Klantnummer', readonly: true },
  { field: 'status', label: 'Status', type: 'select', options: ['actief', 'inactief'] },
  { field: 'klantnaam', label: 'Klantnaam', wide: true },
  { field: 'adres', label: 'Adres', wide: true },
  { field: 'postcode', label: 'Postcode' },
  { field: 'gemeente', label: 'Gemeente' },
  { field: 'land', label: 'Land' },
  { field: 'btw_nummer', label: 'Btw-nummer' },
  { field: 'telefoon', label: 'Telefoon' },
  { field: 'email', label: 'E-mail' }
]

const detailOverlay = $('detail-overlay')
let detailState = null // { id, original: {field: value} }

function closeDetail() {
  detailOverlay.classList.add('hidden')
  detailState = null
}

/** Open het detailvenster voor een klant-id. */
async function openDetail(id) {
  try {
    const c = await window.api.getCustomer(id)
    if (!c) {
      statusEl.textContent = 'Klant niet gevonden.'
      return
    }
    detailState = { id: c.id, original: {} }
    $('detail-title').textContent = `${c.klantnummer} — ${c.klantnaam || ''}`
    $('detail-msg').textContent = ''

    const form = $('detail-form')
    form.innerHTML = ''
    for (const def of DETAIL_FIELDS) {
      const val = c[def.field] == null ? '' : String(c[def.field])
      detailState.original[def.field] = val

      const wrap = document.createElement('div')
      wrap.className = 'field' + (def.wide ? ' wide' : '')
      const lab = document.createElement('label')
      lab.textContent = def.label

      let input
      if (def.type === 'select') {
        input = document.createElement('select')
        for (const opt of def.options) input.add(new Option(opt, opt))
        input.value = def.options.includes(val) ? val : def.options[0]
      } else {
        input = document.createElement('input')
        input.type = 'text'
        input.value = val
        if (def.readonly) input.readOnly = true
      }
      input.dataset.field = def.field
      // Markeer visueel welke velden gewijzigd zijn.
      input.addEventListener('input', () => {
        wrap.classList.toggle('changed', input.value !== detailState.original[def.field])
      })
      input.addEventListener('change', () => {
        wrap.classList.toggle('changed', input.value !== detailState.original[def.field])
      })
      wrap.append(lab, input)
      form.append(wrap)
    }

    await renderHistory(c.id)
    detailOverlay.classList.remove('hidden')
  } catch (err) {
    statusEl.textContent = 'Kon klant niet laden: ' + (err?.message || err)
  }
}

/** Toon de wijzigingshistoriek in het detailvenster. */
async function renderHistory(id) {
  const table = $('detail-history')
  table.innerHTML = ''
  const rows = await window.api.getHistoriek(id)
  const thead = document.createElement('thead')
  thead.innerHTML =
    '<tr><th>Datum</th><th>Veld</th><th>Oud</th><th>Nieuw</th></tr>'
  const tbody = document.createElement('tbody')
  if (!rows.length) {
    const tr = document.createElement('tr')
    const td = document.createElement('td')
    td.colSpan = 4
    td.className = 'muted'
    td.textContent = 'Nog geen wijzigingen.'
    tr.append(td)
    tbody.append(tr)
  } else {
    const labelOf = Object.fromEntries(DETAIL_FIELDS.map((d) => [d.field, d.label]))
    for (const r of rows) {
      const tr = document.createElement('tr')
      const cells = [
        r.changed_at || '',
        labelOf[r.veld] || r.veld,
        r.oud == null ? '' : r.oud,
        r.nieuw == null ? '' : r.nieuw
      ]
      for (const c of cells) {
        const td = document.createElement('td')
        td.textContent = String(c)
        tr.append(td)
      }
      tbody.append(tr)
    }
  }
  table.append(thead, tbody)
}

$('detail-save').addEventListener('click', async () => {
  if (!detailState) return
  const changes = {}
  for (const input of $('detail-form').querySelectorAll('[data-field]')) {
    const f = input.dataset.field
    if (f === 'klantnummer') continue // sleutel niet wijzigen
    const v = input.value
    if (v !== detailState.original[f]) changes[f] = v
  }
  if (Object.keys(changes).length === 0) {
    $('detail-msg').textContent = 'Geen wijzigingen om op te slaan.'
    return
  }
  const saveBtn = $('detail-save')
  saveBtn.disabled = true
  $('detail-msg').textContent = 'Opslaan…'
  try {
    const updated = await window.api.updateCustomer(detailState.id, changes)
    // Nieuwe uitgangswaarden zetten en markeringen wissen.
    for (const input of $('detail-form').querySelectorAll('[data-field]')) {
      const f = input.dataset.field
      const nv = updated[f] == null ? '' : String(updated[f])
      detailState.original[f] = nv
      input.value = f === 'status' && !nv ? 'actief' : nv
      input.parentElement.classList.remove('changed')
    }
    $('detail-title').textContent = `${updated.klantnummer} — ${updated.klantnaam || ''}`
    $('detail-msg').textContent = 'Opgeslagen.'
    await renderHistory(detailState.id)
    reload() // grid verversen
  } catch (err) {
    $('detail-msg').textContent = 'Opslaan mislukt: ' + (err?.message || err)
  } finally {
    saveBtn.disabled = false
  }
})

$('detail-close').addEventListener('click', closeDetail)
$('detail-cancel').addEventListener('click', closeDetail)
detailOverlay.addEventListener('click', (e) => {
  if (e.target === detailOverlay) closeDetail()
})

// --- Excel-import -----------------------------------------------------------
/** Doelvelden met Nederlandse labels (klantnummer is verplicht). */
const IMPORT_FIELDS = [
  ['klantnummer', 'Klantnummer *'],
  ['klantnaam', 'Klantnaam'],
  ['adres', 'Adres'],
  ['postcode', 'Postcode'],
  ['gemeente', 'Gemeente'],
  ['land', 'Land'],
  ['btw_nummer', 'Btw-nummer'],
  ['telefoon', 'Telefoon'],
  ['email', 'E-mail'],
  ['status', 'Status']
]

const overlay = $('import-overlay')
const sheetSelect = $('import-sheet')
let importData = null // { filePath, sheets: [...] }

function openImportModal() {
  overlay.classList.remove('hidden')
}
function closeImportModal() {
  overlay.classList.add('hidden')
  importData = null
}

/** Bouw de mapping-selects en het voorbeeld voor het gekozen werkblad. */
function renderSheet(idx) {
  const sheet = importData.sheets[idx]
  $('import-rowcount').textContent = `${nlNumber.format(sheet.rowCount)} rijen`

  // Kolommapping.
  const mapDiv = $('import-mapping')
  mapDiv.innerHTML = ''
  for (const [field, label] of IMPORT_FIELDS) {
    const row = document.createElement('div')
    row.className = 'map-row'
    const lab = document.createElement('label')
    lab.textContent = label
    const sel = document.createElement('select')
    sel.dataset.field = field
    const none = new Option('— (geen) —', '')
    sel.add(none)
    for (const h of sheet.headers) sel.add(new Option(h, h))
    sel.value = sheet.mapping[field] || ''
    row.append(lab, sel)
    mapDiv.append(row)
  }

  // Voorbeeldtabel.
  const table = $('import-preview')
  table.innerHTML = ''
  const thead = document.createElement('thead')
  const htr = document.createElement('tr')
  for (const h of sheet.headers) {
    const th = document.createElement('th')
    th.textContent = h
    htr.append(th)
  }
  thead.append(htr)
  const tbody = document.createElement('tbody')
  for (const r of sheet.sample) {
    const tr = document.createElement('tr')
    for (const h of sheet.headers) {
      const td = document.createElement('td')
      const v = r[h]
      td.textContent = v == null ? '' : String(v)
      tr.append(td)
    }
    tbody.append(tr)
  }
  table.append(thead, tbody)
}

function collectMapping() {
  const mapping = {}
  for (const sel of $('import-mapping').querySelectorAll('select')) {
    mapping[sel.dataset.field] = sel.value || null
  }
  return mapping
}

/** Gedeelde importflow voor Excel en PDF. @param {() => Promise<any>} analyzeFn */
async function startImport(analyzeFn, soort) {
  $('import-msg').textContent = ''
  statusEl.textContent = `${soort} kiezen…`
  try {
    const data = await analyzeFn()
    if (!data) {
      statusEl.textContent = 'Import geannuleerd.'
      return
    }
    importData = data
    sheetSelect.innerHTML = ''
    data.sheets.forEach((s, i) => sheetSelect.add(new Option(`${s.name} (${s.rowCount})`, String(i))))
    sheetSelect.value = '0'
    // Werkbladkeuze verbergen bij één werkblad (PDF heeft er altijd één).
    sheetSelect.parentElement.style.display = data.sheets.length > 1 ? '' : 'none'
    const s = await window.api.getSettings()
    $('import-mark-missing').checked = !!s.markMissingInactive
    renderSheet(0)
    openImportModal()
    statusEl.textContent = ''
    if (importData.sheets[0].rowCount === 0) {
      $('import-msg').textContent =
        'Geen bruikbare rijen gevonden. Controleer of het bestand klantnummers bevat.'
    }
  } catch (err) {
    statusEl.textContent = 'Kon bestand niet lezen: ' + (err?.message || err)
  }
}

$('btn-import').addEventListener('click', () => startImport(() => window.api.analyzeImport(), 'Excel-bestand'))
$('btn-pdf').addEventListener('click', () => startImport(() => window.api.analyzePdfImport(), 'PDF-bestand'))

sheetSelect.addEventListener('change', () => renderSheet(Number(sheetSelect.value)))
$('import-close').addEventListener('click', closeImportModal)
$('import-cancel').addEventListener('click', closeImportModal)
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeImportModal()
})

$('import-run').addEventListener('click', async () => {
  const mapping = collectMapping()
  if (!mapping.klantnummer) {
    $('import-msg').textContent = 'Koppel eerst de kolom "Klantnummer".'
    return
  }
  const idx = Number(sheetSelect.value)
  const markMissing = $('import-mark-missing').checked
  const runBtn = $('import-run')
  runBtn.disabled = true
  $('import-msg').textContent = 'Bezig met importeren…'
  try {
    await window.api.setSetting('markMissingInactive', markMissing)
    const res = await window.api.runImport({
      filePath: importData.filePath,
      sheetName: importData.sheets[idx].name,
      mapping,
      markMissingInactive: markMissing
    })
    closeImportModal()
    const parts = [
      `${nlNumber.format(res.inserted)} nieuw`,
      `${nlNumber.format(res.updated)} bijgewerkt`
    ]
    if (res.skipped) parts.push(`${nlNumber.format(res.skipped)} overgeslagen`)
    if (res.marked) parts.push(`${nlNumber.format(res.marked)} inactief gemarkeerd`)
    statusEl.textContent = 'Import klaar: ' + parts.join(', ')
    currentQuery = searchInput.value
    reload()
    await refreshEmptyState()
  } catch (err) {
    $('import-msg').textContent = 'Import mislukt: ' + (err?.message || err)
  } finally {
    runBtn.disabled = false
  }
})

// --- Instellingen -----------------------------------------------------------
const settingsOverlay = $('settings-overlay')

async function refreshDbInfo() {
  try {
    const stats = await window.api.stats()
    $('set-dbpath').textContent = stats.dbPath || '—'
    $('set-count').textContent = nlNumber.format(stats.total)
  } catch {
    /* stil */
  }
}

async function openSettings() {
  const s = await window.api.getSettings()
  $('set-dark').checked = !!s.darkMode
  $('set-fuzzy').checked = s.fuzzyEnabled !== false
  $('set-mark-missing').checked = !!s.markMissingInactive
  $('settings-msg').textContent = ''
  await refreshDbInfo()
  settingsOverlay.classList.remove('hidden')
}
function closeSettings() {
  settingsOverlay.classList.add('hidden')
}

$('btn-settings').addEventListener('click', openSettings)
$('settings-close').addEventListener('click', closeSettings)
$('settings-done').addEventListener('click', closeSettings)
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettings()
})

$('set-dark').addEventListener('change', async (e) => {
  applyDark(e.target.checked)
  await window.api.setSetting('darkMode', e.target.checked)
})
$('set-fuzzy').addEventListener('change', async (e) => {
  await window.api.setSetting('fuzzyEnabled', e.target.checked)
  reload() // opnieuw zoeken met/zonder typefouttolerantie
})
$('set-mark-missing').addEventListener('change', async (e) => {
  await window.api.setSetting('markMissingInactive', e.target.checked)
})

async function switchDatabase(fn) {
  $('settings-msg').textContent = 'Bezig…'
  try {
    const res = await fn()
    if (!res) {
      $('settings-msg').textContent = 'Geannuleerd.'
      return
    }
    searchInput.value = ''
    currentQuery = ''
    reload()
    await refreshDbInfo()
    await refreshEmptyState()
    $('settings-msg').textContent = `Actief: ${nlNumber.format(res.total)} klanten.`
    statusEl.textContent = `Database gewijzigd: ${nlNumber.format(res.total)} klanten.`
  } catch (err) {
    $('settings-msg').textContent = 'Mislukt: ' + (err?.message || err)
  }
}
$('set-db-open').addEventListener('click', () => switchDatabase(() => window.api.openDatabase()))
$('set-db-new').addEventListener('click', () => switchDatabase(() => window.api.newDatabase()))

// --- Startpagina (lege database) --------------------------------------------
const welcomeEl = $('welcome')

/** Toon het welkomscherm alleen bij een lege database. @returns {Promise<number>} totaal */
async function refreshEmptyState() {
  let total = 0
  try {
    total = (await window.api.stats()).total
  } catch {
    /* stil */
  }
  const empty = total === 0
  welcomeEl.classList.toggle('hidden', !empty)
  if (empty) {
    statusEl.textContent = 'Lege database — importeer klanten of genereer testdata om te beginnen.'
    timingEl.textContent = ''
  }
  return total
}

$('wel-excel').addEventListener('click', () => startImport(() => window.api.analyzeImport(), 'Excel-bestand'))
$('wel-pdf').addEventListener('click', () => startImport(() => window.api.analyzePdfImport(), 'PDF-bestand'))
$('wel-seed').addEventListener('click', runSeed)
$('wel-open').addEventListener('click', () => switchDatabase(() => window.api.openDatabase()))

// Escape sluit een open dialoog.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (!detailOverlay.classList.contains('hidden')) closeDetail()
  else if (!settingsOverlay.classList.contains('hidden')) closeSettings()
  else if (!overlay.classList.contains('hidden')) closeImportModal()
})

// --- Opstarten --------------------------------------------------------------
async function init() {
  try {
    const s = await window.api.getSettings()
    applyDark(!!s.darkMode)
  } catch {
    applyDark(false)
  }
  try {
    await refreshEmptyState()
  } catch (err) {
    console.error(err)
  }
  searchInput.focus()
}

init()
