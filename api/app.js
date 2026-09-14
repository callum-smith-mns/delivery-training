import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { FileStorage } from './lib/storage.js'
import { TeamService } from './service/teamService.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const reportFile = path.join(currentDir, 'public', 'report.html')

// Normalize a mount prefix (e.g. "/delivery" or "delivery/") to a leading-slash,
// no-trailing-slash path, or '' when the API is served from the domain root.
function normalizeBasePath(value) {
  if (!value) return ''
  const trimmed = String(value).trim().replace(/\/+$/, '')
  if (!trimmed || trimmed === '/') return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function createApiApp({ dbPath, basePath } = {}) {
  const defaultDbPath = path.join(currentDir, 'data', 'teams.json')
  const storage = new FileStorage(
    dbPath ?? globalThis.process?.env.DB_PATH ?? defaultDbPath,
  )
  const teamService = new TeamService({ storage })
  const mountPath = normalizeBasePath(basePath ?? process.env.BASE_PATH)

  const app = express()
  app.use(cors())
  app.use(express.json())

  const router = express.Router()

  router.get('/api/health', (_request, response) => {
    response.json({ ok: true })
  })

  router.post('/api/teams', async (request, response, next) => {
    try {
      const result = await teamService.createTeam({
        playerName: request.body?.name,
        teamName: request.body?.teamName,
        origin: request.body?.origin,
      })
      response.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/teams/join', async (request, response, next) => {
    try {
      const result = await teamService.joinTeam({
        teamCode: request.body?.teamCode,
        playerName: request.body?.name,
      })
      response.json(result)
    } catch (error) {
      next(error)
    }
  })

  router.get('/api/teams/:teamCode', async (request, response, next) => {
    try {
      const team = await teamService.getTeam(request.params.teamCode)
      response.json({ team })
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/teams/:teamCode/start', async (request, response, next) => {
    try {
      const team = await teamService.startGame({
        teamCode: request.params.teamCode,
        playerId: request.body?.playerId,
        lineCount: request.body?.lineCount,
        totalCarriages: request.body?.totalCarriages,
        parcelsPerCarriage: request.body?.parcelsPerCarriage,
      })
      response.json({ team })
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/teams/:teamCode/load', async (request, response, next) => {
    try {
      const team = await teamService.loadParcel({
        teamCode: request.params.teamCode,
        playerId: request.body?.playerId,
        lineId: request.body?.lineId,
        carriageId: request.body?.carriageId,
        parcelId: request.body?.parcelId,
      })
      response.json({ team })
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/teams/:teamCode/play', async (request, response, next) => {
    try {
      const team = await teamService.playLine({
        teamCode: request.params.teamCode,
        playerId: request.body?.playerId,
        lineId: request.body?.lineId,
      })
      response.json({ team })
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/teams/:teamCode/restart', async (request, response, next) => {
    try {
      const team = await teamService.restartGame({
        teamCode: request.params.teamCode,
        playerId: request.body?.playerId,
      })
      response.json({ team })
    } catch (error) {
      next(error)
    }
  })

  router.get('/api/teams/:teamCode/stats', async (request, response, next) => {
    try {
      const team = await teamService.getTeam(request.params.teamCode)
      const currentGame = team.game
        ? [
            {
              gameNumber: team.game.gameNumber ?? team.gameCount,
              startedAt: team.game.startedAt ?? null,
              completedAt: team.game.completedAt ?? null,
              scoreEvents: team.game.scoreEvents ?? [],
            },
          ]
        : []

      response.json({
        scoreEvents: team.game?.scoreEvents ?? [],
        games: [...team.games, ...currentGame],
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/api/data', async (_request, response, next) => {
    try {
      const data = await storage.readData()
      response.json(data)
    } catch (error) {
      next(error)
    }
  })

  router.get('/api/admin/overview', async (_request, response, next) => {
    try {
      response.json(await teamService.getAdminOverview())
    } catch (error) {
      next(error)
    }
  })

  router.post('/api/admin/teams/:teamCode/cancel', async (request, response, next) => {
    try {
      const team = await teamService.closeOpenGame({ teamCode: request.params.teamCode })
      response.json({ team })
    } catch (error) {
      next(error)
    }
  })

  router.get(['/report', '/report.html'], (_request, response) => {
    response.sendFile(reportFile)
  })

  // Mount every route under the configurable base path so the API can be hosted
  // in a subfolder; requests then resolve relative to that prefix.
  app.use(mountPath || '/', router)

  app.use((error, _request, response, _next) => {
    const statusCode = error.statusCode ?? 500
    response.status(statusCode).json({
      error: error.message ?? 'Unexpected server error',
    })
  })

  return app
}
