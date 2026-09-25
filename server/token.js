// Server side only. The Helius key never reaches the browser.
//
// Price moves every second, so it is read where it lives:
//   1. The Raydium CPMM pool CIB / BP, read on chain through Helius every request:
//      spot price = BP reserve / CIB reserve (fees owed to protocol, fund and creator excluded),
//      times BP in USD from DexScreener. Market cap = price * total supply, as DexScreener does.
//      24h volume = DexScreener volume.h24 of this pair.
//   2. DexScreener alone (priceUsd, marketCap, volume.h24 as served).
//   3. The LaunchLab curve on chain, from before migration.
//   4. Helius price_info as the last resort.
// Helius getAsset always supplies name, symbol, image, supply and decimals.

export const MINT = 'EN74JUrqLk4s88fwXXZPctzT8c3Dbrr3Uwa6JbNT8LDt'
export const BP = 'BPxxfRCXkUVhig4HS1Lh7kZqV6SPJhzfEk4x6fVBjPCy' // Backpack, the quote token
const POOL = '7Z8gozgsxwmQPjVtcLKDXtdMoNtn8Mc7Bqwq8noaEkvi' // LaunchLab curve, CIB / BP (migrated)
const CPMM = 'GMGmPNwtvRcRRBXp24y6UWyvqBH8L38mcRK3QbtoF8Mq' // Raydium CPMM pool, CIB / BP
const CPMM_PROGRAM = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'
const LAUNCHLAB = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj'

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`${res.status} ${url.split('?')[0]}`)
  return res.json()
}

const rpc = (apiKey, method, params) =>
  getJson(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'cib', method, params }),
  }).then((b) => {
    if (b.error) throw new Error(b.error.message)
    return b.result
  })

/* Helius: metadata, refreshed every few minutes */
let asset = null
let assetAt = 0
async function heliusAsset(apiKey) {
  if (asset && Date.now() - assetAt < 180_000) return asset
  const a = await rpc(apiKey, 'getAsset', { id: MINT, displayOptions: { showFungible: true } })
  const info = a.token_info ?? {}
  const meta = a.content?.metadata ?? {}
  asset = {
    name: meta.name || a.mint_extensions?.metadata?.name || 'Cat in backpack',
    symbol: meta.symbol || info.symbol || 'CIB',
    image: a.content?.links?.image || a.content?.files?.[0]?.uri || null,
    decimals: info.decimals ?? 6,
    supply: info.supply != null ? info.supply / 10 ** (info.decimals ?? 6) : null,
    heliusPrice: info.price_info?.price_per_token ?? null,
  }
  assetAt = Date.now()
  return asset
}

/* DexScreener: the most liquid pair, if one exists */
async function dexPair(mint) {
  const body = await getJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)
  const pairs = (body.pairs ?? []).filter((p) => p.chainId === 'solana' && p.baseToken?.address === mint)
  pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
  return pairs[0] ?? null
}

/* LaunchLab pool state, decoded from the account (Raydium LaunchLab PoolState layout) */
async function curve(apiKey) {
  const res = await rpc(apiKey, 'getAccountInfo', [POOL, { encoding: 'base64', commitment: 'confirmed' }])
  const v = res?.value
  if (!v || v.owner !== LAUNCHLAB) throw new Error('pool not found')
  const d = Buffer.from(v.data[0], 'base64')
  const status = d.readUInt8(17)
  const decA = d.readUInt8(18)
  const decB = d.readUInt8(19)
  const u64 = (o) => d.readBigUInt64LE(o)
  const supply = u64(21)
  const virtualA = u64(37)
  const virtualB = u64(45)
  const realA = u64(53)
  const realB = u64(61)
  // Constant product curve: spot price of A in B.
  const priceInB = (Number(virtualB + realB) / Number(virtualA - realA)) * 10 ** (decA - decB)
  return { status, priceInB, supply: Number(supply) / 10 ** decA, slot: res.context.slot }
}

/* Raydium CPMM pool state (raydium-cp-swap PoolState) plus both vaults, one RPC call */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58(buf) {
  let n = BigInt('0x' + buf.toString('hex'))
  let out = ''
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n }
  for (const b of buf) { if (b !== 0) break; out = '1' + out }
  return out
}

let vaults = null
async function cpmm(apiKey) {
  if (!vaults) {
    const res = await rpc(apiKey, 'getAccountInfo', [CPMM, { encoding: 'base64' }])
    const d = Buffer.from(res.value.data[0], 'base64')
    vaults = [base58(d.subarray(72, 104)), base58(d.subarray(104, 136))]
    const mint0 = base58(d.subarray(168, 200))
    if (mint0 !== BP) throw new Error('unexpected pool order')
  }
  const res = await rpc(apiKey, 'getMultipleAccounts', [[CPMM, ...vaults], { encoding: 'base64', commitment: 'confirmed' }])
  const [pool, v0, v1] = res.value.map((a) => a && Buffer.from(a.data[0], 'base64'))
  if (!pool || res.value[0].owner !== CPMM_PROGRAM) throw new Error('cpmm pool missing')
  if (pool.readUInt8(329) !== 0) throw new Error('cpmm pool paused')
  const u64 = (b, o) => b.readBigUInt64LE(o)
  const dec0 = pool.readUInt8(331)
  const dec1 = pool.readUInt8(332)
  // Reserves the curve actually trades against: vault balance minus fees owed.
  const r0 = u64(v0, 64) - u64(pool, 341) - u64(pool, 357) - u64(pool, 397)
  const r1 = u64(v1, 64) - u64(pool, 349) - u64(pool, 365) - u64(pool, 405)
  const priceInBP = (Number(r0) / 10 ** dec0) / (Number(r1) / 10 ** dec1)
  return { priceInBP, slot: res.context.slot }
}

// Slow parts of the quote change slower than the price; keep them a few seconds.
function every(ms, fn) {
  let at = 0
  let value = null
  let pending = null
  return async () => {
    if (value != null && Date.now() - at < ms) return value
    pending ??= fn().then((v) => { value = v; at = Date.now(); return v }).finally(() => (pending = null))
    try { return await pending } catch (e) { if (value != null) return value; throw e }
  }
}
const cpmmPair = every(3000, async () => {
  const body = await getJson(`https://api.dexscreener.com/latest/dex/pairs/solana/${CPMM}`)
  return body.pairs?.[0] ?? body.pair ?? null
})

async function bpUsdNow() {
  try {
    const p = await dexPair(BP)
    if (p?.priceUsd) return Number(p.priceUsd)
  } catch {}
  const body = await getJson(`https://lite-api.jup.ag/price/v3?ids=${BP}`)
  return body[BP]?.usdPrice ?? null
}

const bpUsd = every(5000, bpUsdNow)

async function jupiter24h() {
  const [t] = await getJson(`https://lite-api.jup.ag/tokens/v2/search?query=${MINT}`)
  if (!t || t.id !== MINT) return null
  const s = t.stats24h ?? {}
  return (s.buyVolume ?? 0) + (s.sellVolume ?? 0)
}

const settled = (p) => p.then((v) => v, () => null)

/* Last valid quote, held when a round fails */
let last = null
let inflight = null
let inflightAt = 0

async function quote(apiKey) {
  const [meta, live, pairNow, bp] = await Promise.all([
    settled(heliusAsset(apiKey)),
    settled(cpmm(apiKey)),
    settled(cpmmPair()),
    settled(bpUsd()),
  ])
  const base = meta ?? asset ?? { name: 'Cat in backpack', symbol: 'CIB', image: null }
  const supply = base.supply ?? 1e9

  if (live && bp) {
    const price = live.priceInBP * bp
    return {
      ...base,
      source: 'chain',
      pair: 'CIB / BP',
      price,
      marketCap: price * supply,
      volume24h: pairNow?.volume?.h24 ?? last?.volume24h ?? null,
      slot: live.slot,
    }
  }

  const pair = pairNow ?? (await settled(dexPair(MINT)))

  if (pair?.priceUsd) {
    return {
      ...base,
      source: 'dexscreener',
      pair: `${pair.baseToken.symbol} / ${pair.quoteToken.symbol}`,
      price: Number(pair.priceUsd),
      marketCap: pair.marketCap ?? pair.fdv ?? null,
      volume24h: pair.volume?.h24 ?? null,
    }
  }

  const [c, vol] = await Promise.all([settled(curve(apiKey)), settled(jupiter24h())])
  if (c && bp) {
    const price = c.priceInB * bp
    return {
      ...base,
      source: 'launchlab',
      pair: 'CIB / BP',
      price,
      marketCap: price * c.supply,
      volume24h: vol,
      slot: c.slot,
    }
  }

  if (base.heliusPrice != null && base.supply != null) {
    return {
      ...base,
      source: 'helius',
      pair: 'CIB / BP',
      price: base.heliusPrice,
      marketCap: base.heliusPrice * base.supply,
      volume24h: vol ?? last?.volume24h ?? null,
    }
  }
  throw new Error('no market source answered')
}

export async function loadToken(apiKey) {
  if (!apiKey) throw new Error('HELIUS_API_KEY missing')

  // Viewers polling at once share one on chain read per 800 ms.
  if (!inflight || Date.now() - inflightAt > 800) {
    inflightAt = Date.now()
    inflight = quote(apiKey)
  }
  try {
    const q = await inflight
    if (q.volume24h == null && last) q.volume24h = last.volume24h
    last = { ...q, quotedAt: Date.now() }
    return { ...last, live: true, mint: MINT }
  } catch (err) {
    if (last) return { ...last, live: false, mint: MINT }
    throw err
  }
}
