import '@fontsource-variable/bodoni-moda/opsz.css'
import '@fontsource-variable/bodoni-moda/opsz-italic.css'
import './style.css'
import { money, price } from './format.js'
import { ticker } from './ticker.js'
import { createScene } from './scene.js'

const MINT = 'EN74JUrqLk4s88fwXXZPctzT8c3Dbrr3Uwa6JbNT8LDt'
const IMAGE = 'https://gateway.irys.xyz/7KvyBg44MXzyoTvsbJQCHdJ2cJSE9tyEAMBDyYqUdCt2'
const POLL_MS = 8000
const STALE_MS = 30_000

const $ = (id) => document.getElementById(id)
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
if (calm) document.body.classList.add('calm')

/* ---------- Picture ---------- */

const still = $('still')
let scene = null

function loadPicture(src) {
  return new Promise((resolve) => {
    still.onload = () => resolve(true)
    still.onerror = () => resolve(false)
    still.src = src
  })
}

const pictureReady = loadPicture(IMAGE).then((ok) => {
  if (!ok) return document.body.classList.add('no-picture')
  try {
    scene = createScene($('scene'), still, { calm })
  } catch (err) {
    console.warn('webgl unavailable, using the still', err)
  }
  if (scene) {
    scene.onPull = () => document.body.classList.add('pulled')
    scene.start()
  } else {
    document.body.classList.add('no-gl')
  }
})

/* The pull: hold anywhere that is not a control. */
const stage = document.documentElement
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('a, button')) return
  scene?.hold(true)
})
for (const ev of ['pointerup', 'pointercancel', 'blur']) addEventListener(ev, () => scene?.hold(false))
addEventListener('contextmenu', (e) => e.target.closest('a') || e.preventDefault())

/* ---------- Opening: picture unzips, then the type arrives, then stillness ---------- */

Promise.race([
  Promise.all([pictureReady, document.fonts.ready]),
  new Promise((r) => setTimeout(r, 1800)),
]).then(() => document.body.classList.add('in'))

/* ---------- Live figures ---------- */

const set = {
  mcap: ticker($('mcap'), { calm }),
  price: ticker($('price'), { calm }),
  vol: ticker($('vol'), { calm }),
}

let lastGood = 0
const clock = $('clock')
const time = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function mark() {
  if (!lastGood) return
  const fresh = Date.now() - lastGood < STALE_MS
  clock.textContent = `${fresh ? 'live' : 'held'} ${time(lastGood)}`
  document.body.classList.toggle('stale', !fresh)
}

let shown = false
function render(d) {
  if (d.live) lastGood = d.quotedAt
  else lastGood ||= d.quotedAt
  mark()

  if (d.pair) $('pair').textContent = d.source === 'dexscreener' ? d.pair : `${d.pair} on LaunchLab`

  const apply = () => {
    set.mcap(money(d.marketCap))
    set.price(price(d.price))
    set.vol(money(d.volume24h))
  }
  if (shown) return apply()
  shown = true
  // The first figures turn in just after the type has settled.
  const wait = () => (document.body.classList.contains('in') ? setTimeout(apply, calm ? 0 : 520) : setTimeout(wait, 60))
  wait()
}

async function refresh() {
  try {
    const res = await fetch('/api/token', { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    render(data)
  } catch (err) {
    console.warn('quote failed:', err.message)
  }
  mark()
}

let timer = 0
function loop() {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    if (!document.hidden) await refresh()
    loop()
  }, POLL_MS)
}
refresh().then(loop)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh().then(loop)
})

/* ---------- Actions ---------- */

$('copy').addEventListener('click', async (e) => {
  const btn = e.currentTarget
  try {
    await navigator.clipboard.writeText(MINT)
  } catch {
    const t = Object.assign(document.createElement('textarea'), { value: MINT })
    document.body.append(t)
    t.select()
    document.execCommand('copy')
    t.remove()
  }
  btn.textContent = 'copied'
  btn.classList.add('done')
  clearTimeout(btn._t)
  btn._t = setTimeout(() => {
    btn.textContent = 'copy ca'
    btn.classList.remove('done')
  }, 1400)
})
