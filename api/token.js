// Vercel serverless route. Same data as the Vite dev middleware.
import { loadToken } from '../server/token.js'

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 's-maxage=1, stale-while-revalidate=1')
  try {
    res.status(200).send(JSON.stringify(await loadToken(process.env.HELIUS_API_KEY)))
  } catch (err) {
    res.status(502).send(JSON.stringify({ error: String(err.message ?? err) }))
  }
}
