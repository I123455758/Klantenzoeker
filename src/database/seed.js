import { getDb } from './connection.js'
import { bulkInsert, countCustomers, deleteAllCustomers } from './queries.js'
import { logger } from '../utils/logger.js'

/**
 * Genereer een grote dummydataset om zoekprestaties realistisch te testen.
 * Bevat gegarandeerd de acceptatie-klanten (AUTO CARS BV, René, KL000152).
 */

const VOORNAMEN = ['Jan', 'Piet', 'Marie', 'Sofie', 'René', 'Ahmed', 'Lucas', 'Emma', 'Noah', 'Lien', 'Wout', 'Fatima', 'Tom', 'Elke', 'Karel', 'Nele', 'Bram', 'Iris', 'Joris', 'Anke']
const ACHTERNAMEN = ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Mertens', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Dubois', 'Lambert', 'Martin', 'Vermeulen', 'Declercq', 'Aerts', 'Segers', 'Hermans', 'Van Damme', 'Coppens']
// 'Auto' en 'Cars' zijn bewust weggelaten: die reserveren we voor de vaste
// acceptatie-fixture AUTO CARS BV zodat die klant uniek en vindbaar blijft.
const BEDRIJF_A = ['Rapid', 'Bouw', 'Groen', 'Tech', 'Prima', 'Euro', 'Belga', 'Noord', 'Zuid', 'Metro', 'Delta', 'Alpha', 'Vlaams', 'Smart', 'Digi', 'Aqua', 'Solar', 'Logis', 'Trans', 'Food']
const BEDRIJF_B = ['Motors', 'Bouw', 'Services', 'Solutions', 'Trading', 'Consult', 'Group', 'Systems', 'Works', 'Center', 'Partners', 'Invest', 'Logistics', 'Products', 'Retail', 'Design', 'Care', 'Energy', 'Media', 'Foods']
const RECHTSVORM = ['BV', 'NV', 'BVBA', 'VOF', 'CV', 'Comm.V']
const STRATEN = ['Kerkstraat', 'Stationsstraat', 'Dorpsstraat', 'Nieuwstraat', 'Schoolstraat', 'Molenweg', 'Industrieweg', 'Marktplein', 'Kloosterstraat', 'Veldstraat']
const GEMEENTEN = [['Antwerpen', '2000'], ['Gent', '9000'], ['Brugge', '8000'], ['Leuven', '3000'], ['Hasselt', '3500'], ['Mechelen', '2800'], ['Aalst', '9300'], ['Kortrijk', '8500'], ['Genk', '3600'], ['Oostende', '8400']]

function pick(arr, i) {
  return arr[i % arr.length]
}
function rnd(n) {
  return Math.floor(Math.random() * n)
}

/**
 * Bouw één dummyklant.
 * @param {number} i volgnummer (1-based)
 * @returns {Record<string, any>}
 */
function makeCustomer(i) {
  const isBedrijf = i % 3 !== 0
  const [gemeente, postcode] = pick(GEMEENTEN, rnd(GEMEENTEN.length))
  let klantnaam
  if (isBedrijf) {
    klantnaam = `${pick(BEDRIJF_A, rnd(BEDRIJF_A.length))} ${pick(BEDRIJF_B, rnd(BEDRIJF_B.length))} ${pick(RECHTSVORM, rnd(RECHTSVORM.length))}`
  } else {
    klantnaam = `${pick(VOORNAMEN, rnd(VOORNAMEN.length))} ${pick(ACHTERNAMEN, rnd(ACHTERNAMEN.length))}`
  }
  const nr = String(i).padStart(6, '0')
  return {
    klantnummer: `KL${nr}`,
    klantnaam,
    adres: `${pick(STRATEN, rnd(STRATEN.length))} ${1 + rnd(200)}`,
    postcode,
    gemeente,
    land: 'België',
    btw_nummer: `BE0${100000000 + rnd(899999999)}`,
    telefoon: `0${4 + rnd(6)}${String(rnd(100000000)).padStart(8, '0')}`,
    email: `info${i}@example.be`,
    status: i % 50 === 0 ? 'inactief' : 'actief'
  }
}

/** Vaste acceptatie-klanten zodat de zoekvoorbeelden altijd slagen. */
const FIXTURES = [
  { klantnummer: 'KL000152', klantnaam: 'AUTO CARS BV', adres: 'Industrieweg 12', postcode: '2000', gemeente: 'Antwerpen', land: 'België', btw_nummer: 'BE0123456789', telefoon: '032001234', email: 'info@autocars.be', status: 'actief' },
  { klantnummer: 'KL000777', klantnaam: 'René Dubois', adres: 'Kerkstraat 7', postcode: '9000', gemeente: 'Gent', land: 'België', btw_nummer: 'BE0987654321', telefoon: '092007777', email: 'rene@dubois.be', status: 'actief' }
]

/**
 * Vul de database met testdata.
 * @param {number} count aantal willekeurige klanten (fixtures komen erbovenop)
 * @param {(pct: number) => void} [onProgress]
 * @returns {{ inserted: number, total: number }}
 */
export function seedDatabase(count = 100000, onProgress) {
  getDb()
  logger.info('seed', `Genereer ${count} dummyklanten…`)
  deleteAllCustomers()

  bulkInsert(FIXTURES)

  const BATCH = 5000
  let done = 0
  // Fixtures gebruiken i=152 en i=777; sla die volgnummers over om conflicten te vermijden.
  const skip = new Set([152, 777])
  let i = 1 // doorlopende teller: nooit een klantnummer hergebruiken tussen batches
  while (done < count) {
    const batch = []
    while (batch.length < BATCH && done < count) {
      if (!skip.has(i)) {
        batch.push(makeCustomer(i))
        done++
      }
      i++
    }
    bulkInsert(batch)
    if (onProgress) onProgress(Math.round((done / count) * 100))
  }

  const total = countCustomers()
  logger.info('seed', `Klaar. Totaal in database: ${total}`)
  return { inserted: done + FIXTURES.length, total }
}
