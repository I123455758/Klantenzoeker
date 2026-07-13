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
    if (e.data) console.log('Detail (komt in latere fase):', e.data.klantnummer)
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
$('btn-seed').addEventListener('click', async () => {
  const btn = $('btn-seed')
  btn.disabled = true
  const stop = window.api.onSeedProgress((pct) => {
    statusEl.textContent = `Testdata genereren… ${pct}%`
  })
  try {
    const res = await window.api.seed(100000)
    statusEl.textContent = `Testdata klaar: ${nlNumber.format(res.total)} klanten`
    reload()
  } catch (err) {
    statusEl.textContent = 'Seed mislukt: ' + (err?.message || err)
  } finally {
    stop()
    btn.disabled = false
  }
})

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

// --- Opstarten --------------------------------------------------------------
async function init() {
  try {
    const s = await window.api.getSettings()
    applyDark(!!s.darkMode)
  } catch {
    applyDark(false)
  }
  try {
    const stats = await window.api.stats()
    if (stats.total === 0) {
      statusEl.textContent = 'Lege database — klik op "Testdata" om 100k klanten te genereren.'
    }
  } catch (err) {
    console.error(err)
  }
  searchInput.focus()
}

init()
