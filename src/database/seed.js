import { getDb } from './connection.js'
import { bulkInsert, countCustomers, deleteAllCustomers } from './queries.js'
import { logger } from '../utils/logger.js'

/**
 * Genereer een grote dummydataset om zoekprestaties realistisch te testen.
 * Datamodel volgt ADR 0001: kale klantnummers + vier kolommen.
 * Bevat gegarandeerd de acceptatie-klanten (AUTO CARS BV, JIMÉNEZ MAÑA
 * RECAMBIOS SRL, VAN WEZEL AUTOPARTS NV).
 */

const VOORNAMEN = ['Jan', 'Piet', 'Marie', 'Sofie', 'René', 'Ahmed', 'Lucas', 'Emma', 'Noah', 'Lien', 'Wout', 'Fatima', 'Tom', 'Elke', 'Karel', 'Nele', 'Bram', 'Iris', 'Joris', 'Anke']
const ACHTERNAMEN = ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Mertens', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Dubois', 'Lambert', 'Martin', 'Vermeulen', 'Declercq', 'Aerts', 'Segers', 'Hermans', 'Van Damme', 'Coppens']
// 'Auto' en 'Cars' zijn bewust weggelaten: die reserveren we voor de vaste
// acceptatie-fixture AUTO CARS BV zodat die klant uniek en vindbaar blijft.
const BEDRIJF_A = ['Rapid', 'Bouw', 'Groen', 'Tech', 'Prima', 'Euro', 'Belga', 'Noord', 'Zuid', 'Metro', 'Delta', 'Alpha', 'Vlaams', 'Smart', 'Digi', 'Aqua', 'Solar', 'Logis', 'Trans', 'Food']
const BEDRIJF_B = ['Motors', 'Bouw', 'Services', 'Solutions', 'Trading', 'Consult', 'Group', 'Systems', 'Works', 'Center', 'Partners', 'Invest', 'Logistics', 'Products', 'Retail', 'Design', 'Care', 'Energy', 'Media', 'Foods']
const RECHTSVORM = ['BV', 'NV', 'BVBA', 'VOF', 'CV', 'Comm.V']
// Groeperingscodes (Grk5): een klein setje realistische codes.
const GRK_A = ['G100', 'G200', 'G300', 'G400', 'G500', 'G600']
const GRK_B = ['A01', 'A02', 'B01', 'B02', 'C01', 'C02']

function pick(arr, i) {
  return arr[i % arr.length]
}
function rnd(n) {
  return Math.floor(Math.random() * n)
}

/**
 * Bouw één dummyklant volgens het echte datamodel.
 * @param {number} i volgnummer (1-based) — wordt het kale klantnummer
 * @returns {Record<string, any>}
 */
function makeCustomer(i) {
  const isBedrijf = i % 3 !== 0
  const klantnaam = isBedrijf
    ? `${pick(BEDRIJF_A, rnd(BEDRIJF_A.length))} ${pick(BEDRIJF_B, rnd(BEDRIJF_B.length))} ${pick(RECHTSVORM, rnd(RECHTSVORM.length))}`
    : `${pick(VOORNAMEN, rnd(VOORNAMEN.length))} ${pick(ACHTERNAMEN, rnd(ACHTERNAMEN.length))}`
  return {
    klantnummer: String(i), // kaal getal
    klantnaam,
    grk5_a: pick(GRK_A, rnd(GRK_A.length)),
    grk5_b: pick(GRK_B, rnd(GRK_B.length)),
    status: i % 50 === 0 ? 'inactief' : 'actief'
  }
}

/** Vaste acceptatie-klanten zodat de zoekvoorbeelden altijd slagen. */
const FIXTURES = [
  { klantnummer: '152', klantnaam: 'AUTO CARS BV', grk5_a: 'G100', grk5_b: 'A01', status: 'actief' },
  { klantnummer: '777', klantnaam: 'JIMÉNEZ MAÑA RECAMBIOS SRL', grk5_a: 'G200', grk5_b: 'B01', status: 'actief' },
  { klantnummer: '1379', klantnaam: 'VAN WEZEL AUTOPARTS NV', grk5_a: 'G300', grk5_b: 'C01', status: 'actief' }
]

/** Volgnummers die door fixtures bezet zijn — overslaan bij het genereren. */
const FIXTURE_NUMBERS = new Set(FIXTURES.map((f) => Number(f.klantnummer)))

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
  let i = 1 // doorlopende teller: nooit een klantnummer hergebruiken tussen batches
  while (done < count) {
    const batch = []
    while (batch.length < BATCH && done < count) {
      if (!FIXTURE_NUMBERS.has(i)) {
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
