/**
 * Genereer build/icon.png en build/icon.ico uit build/logo.svg met behulp van
 * Electron zelf (geen externe image-tooling nodig). Rendert de SVG in een
 * verborgen venster, maakt een schermafdruk en schaalt naar de icoonmaten.
 *
 *   npx electron scripts/gen-icon.cjs
 */
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')
const svg = readFileSync(join(ROOT, 'build', 'logo.svg'), 'utf8')
const SIZES = [16, 32, 48, 64, 128, 256]

/** Pak losse PNG-buffers in één .ico-container (PNG-entries, Vista+). */
function icoFromPngs(items) {
  const count = items.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type 1 = icon
  header.writeUInt16LE(count, 4)
  const dir = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  items.forEach((it, i) => {
    const e = i * 16
    dir.writeUInt8(it.size >= 256 ? 0 : it.size, e + 0) // width (0 = 256)
    dir.writeUInt8(it.size >= 256 ? 0 : it.size, e + 1) // height
    dir.writeUInt8(0, e + 2) // palette
    dir.writeUInt8(0, e + 3) // reserved
    dir.writeUInt16LE(1, e + 4) // color planes
    dir.writeUInt16LE(32, e + 6) // bits per pixel
    dir.writeUInt32LE(it.buf.length, e + 8)
    dir.writeUInt32LE(offset, e + 12)
    offset += it.buf.length
  })
  return Buffer.concat([header, dir, ...items.map((it) => it.buf)])
}

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: { sandbox: false }
  })
  const html =
    '<!doctype html><meta charset="utf-8">' +
    '<style>*{margin:0;padding:0}html,body{width:512px;height:512px;background:transparent}' +
    'svg{display:block;width:512px;height:512px}</style>' +
    svg
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 500))

  const shot = await win.webContents.capturePage()
  const base = shot.resize({ width: 512, height: 512, quality: 'best' })
  const items = SIZES.map((size) => ({
    size,
    buf: base.resize({ width: size, height: size, quality: 'best' }).toPNG()
  }))

  writeFileSync(join(ROOT, 'build', 'icon.ico'), icoFromPngs(items))
  writeFileSync(join(ROOT, 'build', 'icon.png'), base.resize({ width: 256, height: 256 }).toPNG())
  const size = shot.getSize()
  console.log(`ICON OK — capture ${size.width}x${size.height}, maten ${SIZES.join(',')}`)
  app.quit()
})
