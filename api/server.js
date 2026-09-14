import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiApp } from './app.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = globalThis.process?.env.DB_PATH ?? path.join(__dirname, 'data', 'teams.json')
const basePath = globalThis.process?.env.BASE_PATH
const app = createApiApp({ dbPath, basePath })
const port = Number(globalThis.process?.env.PORT ?? 3001)

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `Delivery API listening on http://127.0.0.1:${port}${basePath ?? ''}`,
  )
})
