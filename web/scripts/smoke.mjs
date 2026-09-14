// End-to-end smoke test against a running preview server (npm run preview).
// Usage: node scripts/smoke.mjs [url] [chrome-path]
import puppeteer from 'puppeteer-core'
import { existsSync, readFileSync } from 'node:fs'

// Login credentials come from web/.env.local (AIMAR_LOGIN_USER / AIMAR_LOGIN_PASSWORD) or the environment.
const envFile = new URL('../.env.local', import.meta.url)
if (existsSync(envFile))
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const i = line.indexOf('=')
    if (i > 0 && !process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1).trim()
  }

const url = process.argv[2] ?? 'http://localhost:4173/'
const chrome = process.argv[3] ?? '/usr/bin/google-chrome'
const shot = process.env.SMOKE_SHOT

const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 800 })
const failures = []
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`)
  if (!ok) failures.push(name)
}
const mapLoaded = () =>
  page.waitForFunction(
    () => {
      const m = window.__aimar?.map
      return m?.getLayer('localities') && m.areTilesLoaded() && m.querySourceFeatures('localities').length > 0
    },
    { timeout: 60000 },
  )

let tileRequests = 0
page.on('request', (r) => r.url().includes('cache.kartverket.no') && tileRequests++)
page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`))

await page.goto(url, { waitUntil: 'networkidle0' })
if (await page.$('#login-user')) {
  await page.type('#login-user', process.env.AIMAR_LOGIN_USER ?? '')
  await page.type('#login-pass', process.env.AIMAR_LOGIN_PASSWORD ?? '')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.map', { timeout: 20000 })
  check('login accepted', true)
}
await mapLoaded()
check('map loads', true)
check('base tiles requested', tileRequests > 0, `${tileRequests} tiles`)

const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready
  return reg.active?.state
})
check('service worker active', sw === 'activated' || sw === 'activating', sw)

// Second load: the SW now controls the page, so tile requests are cached.
await page.reload({ waitUntil: 'networkidle0' })
await mapLoaded()
await page
  .waitForFunction(
    async () => (await caches.has('map-tiles')) && (await (await caches.open('map-tiles')).keys()).length > 0,
    { timeout: 20000 },
  )
  .catch(() => {})
const cached = await page.evaluate(async () =>
  (await caches.has('map-tiles')) ? (await (await caches.open('map-tiles')).keys()).length : 0,
)
check('tiles cached by service worker', cached > 0, `${cached} entries`)

// Click a locality and expect the inspect panel to show it.
const target = await page.evaluate(() => {
  const map = window.__aimar.map
  const f = map.queryRenderedFeatures({ layers: ['localities'] })[0]
  if (!f) return null
  const p = map.project(f.geometry.coordinates)
  const r = map.getContainer().getBoundingClientRect()
  return { x: r.left + p.x, y: r.top + p.y, name: f.properties.navn }
})
check('localities rendered', !!target)
if (target) {
  await page.mouse.click(target.x, target.y)
  const shown = await page
    .waitForFunction((n) => document.querySelector('aside')?.textContent.includes(n), { timeout: 10000 }, target.name)
    .then(() => true, () => false)
  check('inspect panel shows locality', shown, target.name)
}

// Settings persist in localStorage.
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('aimar.settings.v1') ?? '{}'))
check('settings persisted', stored.panel === 'inspect' && Array.isArray(stored.overlays))

// Offline reload: app shell, data and tiles must come from caches.
await page.setOfflineMode(true)
tileRequests = 0
await page.reload({ waitUntil: 'load' })
const offlineOk = await mapLoaded().then(() => true, () => false)
check('offline reload loads map', offlineOk)
const offlineState = await page.evaluate(() => ({
  online: navigator.onLine,
  tilesLoaded: window.__aimar.map.areTilesLoaded(),
  header: document.querySelector('header')?.textContent,
}))
check('offline reload renders map', offlineState.tilesLoaded)
if (shot) {
  await page.screenshot({ path: shot })
  console.log(`screenshot: ${shot}`)
}
await page.setOfflineMode(false)
await browser.close()

if (failures.length) {
  console.error(`\n${failures.length} failure(s): ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nall checks passed')
