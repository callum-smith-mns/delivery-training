import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { FileStorage } from './lib/storage.js'
import { TeamService } from './service/teamService.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const reportFile = path.join(currentDir, 'public', 'report.html')

export function createApiApp({ dbPath } = {}) {
  const storage = new FileStorage(dbPath ?? 'api/data/teams.json')
  const teamService = new TeamService({ storage })

  const app = express()
  app.use(cors())
  app.use(express.json())

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.post('/api/teams', async (request, response, next) => {
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

  app.post('/api/teams/join', async (request, response, next) => {
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

  app.get('/api/teams/:teamCode', async (request, response, next) => {
    try {
      const team = await teamService.getTeam(request.params.teamCode)
      response.json({ team })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/teams/:teamCode/start', async (request, response, next) => {
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

  app.post('/api/teams/:teamCode/load', async (request, response, next) => {
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

  app.post('/api/teams/:teamCode/play', async (request, response, next) => {
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

  app.post('/api/teams/:teamCode/restart', async (request, response, next) => {
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

  app.get('/api/teams/:teamCode/stats', async (request, response, next) => {
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

  app.get('/api/data', async (_request, response, next) => {
    try {
      const data = await storage.readData()
      response.json(data)
    } catch (error) {
      next(error)
    }
  })

  app.get(['/report', '/report.html'], (_request, response) => {
    response.sendFile(reportFile)
  })

  app.use((error, _request, response, _next) => {
    const statusCode = error.statusCode ?? 500
    response.status(statusCode).json({
      error: error.message ?? 'Unexpected server error',
    })
  })

  return app
}
