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

Polled every second from `/api/token` while the tab is visible (edge cached for 1 s, so all
viewers share one read per second):

| Field | Source |
| --- | --- |
| Price USD | Raydium CPMM pool CIB / BP read on chain via Helius, times BP in USD (DexScreener) |
| Market cap USD | price × total supply, the same basis DexScreener uses |
| 24h volume USD | DexScreener `volume.h24` of that pool only |
| Name, symbol, image, supply, decimals | Helius DAS `getAsset` with `showFungible: true` |
| Pair label | CIB / BP (Backpack) |

Fallbacks, in order: DexScreener alone, the LaunchLab curve on chain, Helius `price_info`.

The page shows the time of the last good quote as `live hh:mm:ss`. If quotes fail for 10 s it
keeps the last valid figures and the stamp turns to `held`.

## Code

- `server/token.js` sources and fallbacks, last good quote held server side
- `src/scene.js` WebGL picture: key light, depth, grain, the unzip opening, the pull
- `src/ticker.js` digit reels for the figures
- `src/format.js` `$57,666`, `$1.24M`, `$0.0₄5766`
