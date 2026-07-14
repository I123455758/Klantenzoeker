import { settings } from '../utils/settings.js'

/**
 * Bedrijven (firma's) waarvan we klantenlijsten importeren. Elk bedrijf krijgt
 * een EIGEN databasebestand: de klantnummers overlappen tussen bedrijven (beide
 * beginnen bij 001…), dus ze mogen niet in één tabel terechtkomen.
 *
 * De code is de korte afkorting vooraan het "Bedrijf"-veld van de export, bv.
 * "VWE   VAN WEZEL AUTOPARTS NV" -> VWE, "TRA   UNIPART NV" -> TRA.
 */

/** Bekende bedrijven met een nette weergavenaam. */
export const KNOWN_COMPANIES = {
  VWE: 'Van Wezel Autoparts',
  TRA: 'Unipart'
}

/** Standaardlijst met bedrijven (tabs) zolang er niets is opgeslagen. */
const DEFAULT_COMPANIES = [
  { code: 'VWE', naam: 'Van Wezel Autoparts' },
  { code: 'TRA', naam: 'Unipart' }
]

/**
 * Parse het "Bedrijf"-veld uit een export naar { code, naam }.
 * @param {string} raw bv. "VWE VAN WEZEL AUTOPARTS NV"
 * @returns {{ code: string, naam: string } | null}
 */
export function parseBedrijf(raw) {
  if (!raw) return null
  const s = String(raw).replace(/\s+/g, ' ').trim()
  const m = s.match(/^([A-Za-z]{2,5})\b\s*(.*)$/)
  if (!m) return null
  const code = m[1].toUpperCase()
  const naam = KNOWN_COMPANIES[code] || (m[2] || '').trim() || code
  return { code, naam }
}

/** Alle bekende bedrijven (opgeslagen ∪ standaard), gesorteerd op code. */
export function listCompanies() {
  const stored = settings.get('companies')
  const list = Array.isArray(stored) && stored.length ? stored : DEFAULT_COMPANIES
  return [...list].sort((a, b) => String(a.code).localeCompare(String(b.code)))
}

/**
 * Voeg een bedrijf toe (of vul de naam aan) en bewaar de lijst.
 * @param {string} code @param {string} [naam]
 */
export function registerCompany(code, naam) {
  code = String(code || '').toUpperCase()
  if (!code) return
  const list = listCompanies().slice()
  const i = list.findIndex((c) => c.code === code)
  const nice = KNOWN_COMPANIES[code] || naam || code
  if (i === -1) list.push({ code, naam: nice })
  else if (nice && list[i].naam !== nice && KNOWN_COMPANIES[code]) list[i] = { code, naam: nice }
  settings.set('companies', list)
}

/** Code van het actieve bedrijf; standaard VWE, anders het eerste in de lijst. */
export function activeCompany() {
  const stored = settings.get('activeCompany')
  if (stored) return stored
  const list = listCompanies()
  return (list.find((c) => c.code === 'VWE') || list[0])?.code || 'VWE'
}

/** @param {string} code */
export function setActiveCompany(code) {
  settings.set('activeCompany', String(code || '').toUpperCase())
}
