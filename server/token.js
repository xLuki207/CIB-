// Server side only. The Helius key never reaches the browser.

export const MINT = 'EN74JUrqLk4s88fwXXZPctzT8c3Dbrr3Uwa6JbNT8LDt'
const WSOL = 'So11111111111111111111111111111111111111112'

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) })
  if (!res.ok) throw new Error(`${res.status} ${url.split('?')[0]}`)
  return res.json()
}

async function heliusAsset(apiKey) {
  const body = await getJson(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'cib',
      method: 'getAsset',
      params: { id: MINT, displayOptions: { showFungible: true } },
    }),
  })
  if (body.error) throw new Error(body.error.message)
  return body.result
}

// DexScreener first: the CIB/SOL pair with the most volume.
async function dexVolume() {
  const body = await getJson(`https://api.dexscreener.com/latest/dex/tokens/${MINT}`)
  const solPairs = (body.pairs ?? []).filter(
    (p) => p.chainId === 'solana' && (p.quoteToken?.address === WSOL || p.baseToken?.address === WSOL),
  )
  if (!solPairs.length) return null
  solPairs.sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
  return { volume24h: solPairs[0].volume?.h24 ?? null, priceUsd: Number(solPairs[0].priceUsd) || null }
}

// DexScreener has no pair while the coin is still on the LaunchLab curve. Jupiter does.
async function jupiterStats() {
  const [t] = await getJson(`https://lite-api.jup.ag/tokens/v2/search?query=${MINT}`)
  if (!t || t.id !== MINT) return null
  const s = t.stats24h ?? {}
  return { volume24h: (s.buyVolume ?? 0) + (s.sellVolume ?? 0), priceUsd: t.usdPrice ?? null }
}

// Last good value per field, so one flaky source never blanks a number.
const last = {
  name: 'Cat in backpack',
  symbol: 'CIB',
  image: null,
  price: null,
  supply: null,
  marketCap: null,
  volume24h: null,
}

export async function loadToken(apiKey) {
  if (!apiKey) throw new Error('HELIUS_API_KEY missing in .env')

  const [asset, dex, jup] = await Promise.allSettled([heliusAsset(apiKey), dexVolume(), jupiterStats()])
  const market = (dex.status === 'fulfilled' && dex.value) || (jup.status === 'fulfilled' && jup.value) || {}

  if (asset.status === 'fulfilled') {
    const a = asset.value
    const info = a.token_info ?? {}
    const meta = a.content?.metadata ?? {}
    last.name = meta.name || a.mint_extensions?.metadata?.name || last.name
    last.symbol = meta.symbol || info.symbol || last.symbol
    last.image = a.content?.links?.image || a.content?.files?.[0]?.uri || last.image
    if (info.supply != null) last.supply = info.supply / 10 ** (info.decimals ?? 0)
    last.price = info.price_info?.price_per_token ?? market.priceUsd ?? last.price
  } else if (market.priceUsd != null) {
    last.price = market.priceUsd
  }

  if (last.price != null && last.supply != null) last.marketCap = last.price * last.supply
  if (market.volume24h != null) last.volume24h = market.volume24h

  if (asset.status === 'rejected' && last.price == null) throw asset.reason
  return { mint: MINT, ...last, at: Date.now() }
}
