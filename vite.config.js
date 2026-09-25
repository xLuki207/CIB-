import { defineConfig, loadEnv } from 'vite'
import { loadToken } from './server/token.js'

function tokenApi(apiKey) {
  const handler = async (req, res, next) => {
    if (req.url !== '/api/token') return next()
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    try {
      res.end(JSON.stringify(await loadToken(apiKey)))
    } catch (err) {
      res.statusCode = 502
      res.end(JSON.stringify({ error: String(err.message ?? err) }))
    }
  }
  return {
    name: 'token-api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [tokenApi(env.HELIUS_API_KEY)],
    server: { port: 5190 },
  }
})
