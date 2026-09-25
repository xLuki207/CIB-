# CIB

Cat in backpack, paired with backpack. Live at https://cibpack.fun

## Start

```
cp .env.example .env    # HELIUS_API_KEY=...
npm install
npm run dev             # http://localhost:5190
```

On Vercel, set `HELIUS_API_KEY` in the project environment. `api/token.js` serves the same
route as the dev middleware.

## Live on the page

Polled every 8 s from `/api/token`, only while the tab is visible:

| Field | Source |
| --- | --- |
| Price USD | DexScreener `priceUsd` of the most liquid CIB pair |
| Market cap USD | DexScreener `marketCap` of that pair, as served |
| 24h volume USD | DexScreener `volume.h24` of that pair only |
| Name, symbol, image, supply, decimals | Helius DAS `getAsset` with `showFungible: true` |
| Pair label | base / quote of the chosen pair (CIB / BP, Backpack) |

Before DexScreener indexes a pair (the LaunchLab curve phase), price comes from the curve
itself, read on chain through Helius and multiplied by BP in USD; volume is Jupiter's 24h.
Helius `price_info` is the last resort.

The page shows the time of the last good quote as `live hh:mm:ss`. If quotes fail it keeps the
last valid figures and the stamp turns to `held`.

## Code

- `server/token.js` sources and fallbacks, last good quote held server side
- `src/scene.js` WebGL picture: key light, depth, grain, the unzip opening, the pull
- `src/ticker.js` digit reels for the figures
- `src/format.js` `$57,666`, `$1.24M`, `$0.0₄5766`
