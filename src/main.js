import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import './style.css'
import { money, price } from './format.js'
import { tweenNumber } from './tween.js'
import { liveHero, grain } from './motion.js'

const MINT = 'EN74JUrqLk4s88fwXXZPctzT8c3Dbrr3Uwa6JbNT8LDt'
const POLL_MS = 10_000
const $ = (id) => document.getElementById(id)
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches

const set = {
  mcap: tweenNumber($('mcap'), money),
  vol: tweenNumber($('vol'), money),
  price: tweenNumber($('price'), price, { html: true, log: true }),
}

/* Image: Helius CDN, sized and re-encoded. Raw gateway if the CDN fails, then the wordmark. */
const art = $('art')
const cdn = (raw, w) => `https://cdn.helius-rpc.com/cdn-cgi/image/width=${w},quality=82,format=auto/${raw}`
let rawImage = 'https://gateway.irys.xyz/7KvyBg44MXzyoTvsbJQCHdJ2cJSE9tyEAMBDyYqUdCt2'

art.addEventListener('error', () => {
  if (art.dataset.fallback) return $('hero').classList.add('empty')
  art.dataset.fallback = '1'
  art.removeAttribute('srcset')
  art.src = rawImage
})

function useImage(raw) {
  if (!raw || raw === rawImage) return
  rawImage = raw
  delete art.dataset.fallback
  $('hero').classList.remove('empty')
  art.srcset = `${cdn(raw, 480)} 480w, ${cdn(raw, 784)} 784w`
  art.src = cdn(raw, 784)
}

/* Load: one short choreography once the hero can show, then quiet. */
let entered = false
const entrance = new Promise((resolve) => {
  const go = () => {
    if (entered) return
    entered = true
    document.body.classList.add('in')
    resolve()
  }
  art.decode().then(go, go)
  setTimeout(go, 1200)
})

/* Data */
let first = true
let failures = 0

function render(d) {
  $('symbol').textContent = d.symbol
  document.title = `${d.symbol} ${money(d.marketCap)}`
  useImage(d.image)

  if (first) {
    first = false
    // Count up from zero as the numbers rise into place.
    entrance.then(() => setTimeout(() => {
      set.mcap(d.marketCap, { from: 0, duration: 1100, instant: calm })
      set.vol(d.volume24h, { from: 0, duration: 1100, instant: calm })
      set.price(d.price, { from: d.price / 40, duration: 1100, instant: calm })
    }, calm ? 0 : 280))
    return
  }
  set.mcap(d.marketCap, { instant: calm })
  set.vol(d.volume24h, { instant: calm })
  set.price(d.price, { instant: calm })
}

async function refresh() {
  try {
    const res = await fetch('/api/token', { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    render(data)
    failures = 0
    document.body.classList.remove('stale')
  } catch (err) {
    // Keep the last numbers. Only after a minute without data do they go quiet.
    if (++failures >= 6) document.body.classList.add('stale')
    console.warn('refresh failed:', err.message)
  }
}

let timer = 0
const schedule = () => {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    if (!document.hidden) await refresh()
    schedule()
  }, POLL_MS)
}
refresh().then(schedule)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh().then(schedule)
})

/* Actions */
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

/* Motion */
grain(document.querySelector('.grain'))
if (!calm) liveHero($('hero'), $('drift'))
