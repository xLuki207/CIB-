// Server side only. The Helius key never reaches the browser.
//
// Price, market cap and volume come from the market, in this order:
//   1. DexScreener, most liquid pair: priceUsd, marketCap, volume.h24 exactly as served.
//   2. Until DexScreener indexes a pair: the Raydium LaunchLab curve read on chain through
//      Helius (the exact spot price in BP), times BP in USD. Volume is Jupiter's 24h for CIB,
//      which on the curve is the one and only pool.
//   3. Helius price_info as the last resort.
// Helius getAsset always supplies name, symbol, image, supply and decimals.

export const MINT = 'EN74JUrqLk4s88fwXXZPctzT8c3Dbrr3Uwa6JbNT8LDt'
export const BP = 'BPxxfRCXkUVhig4HS1Lh7kZqV6SPJhzfEk4x6fVBjPCy' // Backpack, the quote token
const POOL = '7Z8gozgsxwmQPjVtcLKDXtdMoNtn8Mc7Bqwq8noaEkvi' // LaunchLab pool, CIB / BP
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

async function bpUsd() {
  try {
    const p = await dexPair(BP)
    if (p?.priceUsd) return Number(p.priceUsd)
  } catch {}
  const body = await getJson(`https://lite-api.jup.ag/price/v3?ids=${BP}`)
  return body[BP]?.usdPrice ?? null
}

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
  const [meta, pair] = await Promise.all([settled(heliusAsset(apiKey)), settled(dexPair(MINT))])
  const base = meta ?? asset ?? { name: 'Cat in backpack', symbol: 'CIB', image: null }

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

  const [c, bp, vol] = await Promise.all([settled(curve(apiKey)), settled(bpUsd()), settled(jupiter24h())])
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

  // Many viewers polling at once share one round every 3 s.
  if (!inflight || Date.now() - inflightAt > 3000) {
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
