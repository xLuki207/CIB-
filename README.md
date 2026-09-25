# CIB · Cat in backpack

One page for `EN74JUrqLk4s88fwXXZPctzT8c3Dbrr3Uwa6JbNT8LDt`. Domain: cibpack.fun

```
cp .env.example .env   # set HELIUS_API_KEY
npm install
npm run dev            # http://localhost:5190
```

## Data

`server/token.js` runs inside Vite as `/api/token`, so the Helius key never reaches the browser.
The page polls it every 10 s, tweens every change, and keeps the last values if a fetch fails.
The server also keeps the last good value per field, so one flaky source never blanks a number.

- **Helius DAS `getAsset`** (`showFungible: true`): name, symbol, image
  (`content.links.image`, then `content.files[0].uri`), supply, decimals, price.
  Market cap = `price_per_token × supply / 10^decimals`.
- **24h volume**: DexScreener, SOL pair with the most volume. While CIB is still on the
  Raydium LaunchLab curve DexScreener returns no pairs, so it falls back to Jupiter
  `tokens/v2/search` (`stats24h` buy + sell volume).

Helius caches `price_info` for a few minutes, so market cap can trail pump.fun a little.

## Deploy

`api/token.js` serves the same route on Vercel. Import the repo, framework preset Vite,
and set `HELIUS_API_KEY` in the project's environment variables.
