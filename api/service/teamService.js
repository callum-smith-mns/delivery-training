import { randomUUID } from 'node:crypto'
import { generateTeamCode } from '../lib/code.js'
import {
  createCarriages,
  createParcelIdsForLine,
  distributeCarriagesAcrossLines,
  lineCapacity,
  shufflePlayerOrder,
} from '../lib/game.js'

function toCleanName(name) {
  return String(name ?? '').trim()
}

function ensurePlayerOnTeam(team, playerId) {
  const player = team.players.find((entry) => entry.id === playerId)
  if (!player) {
    const error = new Error('Player is not part of this team')
    error.statusCode = 403
    throw error
  }
  return player
}

function buildPublicTeam(team) {
  return {
    code: team.code,
    name: team.name ?? '',
    status: team.status,
    hostPlayerId: team.hostPlayerId,
    players: team.players,
    config: team.config,
    game: team.game,
    games: team.games ?? [],
    gameCount: team.gameCount ?? 0,
    createdAt: team.createdAt,
    startedAt: team.startedAt ?? null,
  }
}

// A completed game is archived to a compact, analytics-friendly summary so each
// game's stats stay separate even when the team code and name are reused.
function summarizeGame(game) {
  const scoreEvents = game.scoreEvents ?? []
  return {
    gameNumber: game.gameNumber ?? null,
    startedAt: game.startedAt ?? null,
    completedAt: game.completedAt ?? null,
    scoreEvents,
    parcelsShipped: scoreEvents.reduce(
      (sum, event) => sum + event.parcelsShipped,
      0,
    ),
  }
}

function hasRemainingTurnsForLine(line, playerCount) {
  return line.cycleCount < playerCount
}

export class TeamService {
  constructor({ storage, now = () => new Date(), randomValue = Math.random }) {
    this.storage = storage
    this.now = now
    this.randomValue = randomValue
  }

  async createTeam({ playerName, teamName, origin = 'http://localhost:5173' }) {
    const cleanName = toCleanName(playerName)
    if (!cleanName) {
      const error = new Error('Name is required')
      error.statusCode = 400
      throw error
    }

    const cleanTeamName = toCleanName(teamName)
    if (!cleanTeamName) {
      const error = new Error('Team name is required')
      error.statusCode = 400
      throw error
    }

    const db = await this.storage.readData()

    let teamCode = null
    for (let tries = 0; tries < 20; tries += 1) {
      const candidate = generateTeamCode(8, this.randomValue)
      if (!db.teams[candidate]) {
        teamCode = candidate
        break
      }
    }

    if (!teamCode) {
      const error = new Error('Unable to generate unique team code')
      error.statusCode = 500
      throw error
    }

    const playerId = randomUUID()
    const createdAt = this.now().toISOString()

    const team = {
      code: teamCode,
      name: cleanTeamName,
      status: 'lobby',
      createdAt,
      hostPlayerId: playerId,
      players: [
        {
          id: playerId,
          name: cleanName,
          joinedAt: createdAt,
        },
      ],
      config: {
        lineCount: 1,
        totalCarriages: 8,
        parcelsPerCarriage: 1,
      },
      game: null,
      games: [],
      gameCount: 0,
      startedAt: null,
    }

    db.teams[teamCode] = team
    await this.storage.writeData(db)

    return {
      team: buildPublicTeam(team),
      session: {
        playerId,
        teamCode,
        isHost: true,
      },
      shareLink: `${origin}/?team=${teamCode}`,
    }
  }

  async joinTeam({ teamCode, playerName }) {
    const normalizedCode = String(teamCode ?? '').trim().toUpperCase()
    const cleanName = toCleanName(playerName)
    if (!normalizedCode || !cleanName) {
      const error = new Error('Team code and name are required')
      error.statusCode = 400
      throw error
    }

    const db = await this.storage.readData()
    const team = db.teams[normalizedCode]
    if (!team) {
      const error = new Error('Team not found')
      error.statusCode = 404
      throw error
    }

    if (team.status !== 'lobby') {
      const error = new Error('Team is already in an active game')
      error.statusCode = 409
      throw error
    }

    const playerId = randomUUID()
    team.players.push({
      id: playerId,
      name: cleanName,
      joinedAt: this.now().toISOString(),
    })

    await this.storage.writeData(db)

    return {
      team: buildPublicTeam(team),
      session: {
        playerId,
        teamCode: normalizedCode,
        isHost: team.hostPlayerId === playerId,
      },
    }
  }

  async getTeam(teamCode) {
    const normalizedCode = String(teamCode ?? '').trim().toUpperCase()
    const db = await this.storage.readData()
    const team = db.teams[normalizedCode]
    if (!team) {
      const error = new Error('Team not found')
      error.statusCode = 404
      throw error
    }

    return buildPublicTeam(team)
  }

  async startGame({
    teamCode,
    playerId,
    lineCount,
    totalCarriages,
    parcelsPerCarriage,
  }) {
    const normalizedCode = String(teamCode ?? '').trim().toUpperCase()
    const db = await this.storage.readData()
    const team = db.teams[normalizedCode]
    if (!team) {
      const error = new Error('Team not found')
      error.statusCode = 404
      throw error
    }

    ensurePlayerOnTeam(team, playerId)

    if (team.hostPlayerId !== playerId) {
      const error = new Error('Only the host can start the game')
      error.statusCode = 403
      throw error
    }

    if (team.status !== 'lobby') {
      const error = new Error('Game is already active')
      error.statusCode = 409
      throw error
    }

    const safeTotalCarriages = Math.max(1, Number(totalCarriages ?? team.config.totalCarriages))
    const safeParcelsPerCarriage = Math.max(
      1,
      Number(parcelsPerCarriage ?? team.config.parcelsPerCarriage),
    )
    const carriageDistribution = distributeCarriagesAcrossLines(
      safeTotalCarriages,
      Math.max(1, Number(lineCount ?? team.config.lineCount)),
    )

    const playerOrder = shufflePlayerOrder(
      team.players.map((entry) => entry.id),
      this.randomValue,
    )

    let nextParcelSequence = 1
    const lines = carriageDistribution.map((carriageCount, index) => {
      const lineId = `line-${index + 1}`
      const carriages = createCarriages(
        lineId,
        carriageCount,
        safeParcelsPerCarriage,
      )
      const capacity = carriageCount * safeParcelsPerCarriage
      const parcelResult = createParcelIdsForLine(lineId, capacity, nextParcelSequence)
      nextParcelSequence = parcelResult.nextParcelSequence

      return {
        id: lineId,
        status: 'loading',
        cycleCount: 1,
        activePlayerId: playerOrder[0],
        carriages,
        parcelPool: parcelResult.parcelIds,
        parcelSlots: [...parcelResult.parcelIds],
      }
    })

    const startedAt = this.now().toISOString()
    team.config = {
      lineCount: carriageDistribution.length,
      totalCarriages: safeTotalCarriages,
      parcelsPerCarriage: safeParcelsPerCarriage,
    }
    team.gameCount = (team.gameCount ?? 0) + 1
    team.status = 'active'
    team.startedAt = startedAt
    team.game = {
      gameNumber: team.gameCount,
      startedAt,
      playerOrder,
      nextParcelSequence,
      lines,
      scoreEvents: [],
    }

    await this.storage.writeData(db)
    return buildPublicTeam(team)
  }

  async loadParcel({ teamCode, playerId, lineId, carriageId, parcelId }) {
    const normalizedCode = String(teamCode ?? '').trim().toUpperCase()
    const db = await this.storage.readData()
    const team = db.teams[normalizedCode]
    if (!team) {
      const error = new Error('Team not found')
      error.statusCode = 404
      throw error
    }

    ensurePlayerOnTeam(team, playerId)

    if (team.status !== 'active' || !team.game) {
      const error = new Error('Game is not active')
      error.statusCode = 409
      throw error
    }

    const line = team.game.lines.find((entry) => entry.id === lineId)
    if (!line) {
      const error = new Error('Line not found')
      error.statusCode = 404
      throw error
    }

    if (line.status !== 'loading') {
      const error = new Error('This line has already shipped')
      error.statusCode = 409
      throw error
    }

    if (line.activePlayerId !== playerId) {
      const error = new Error('Only the active player can load this train')
      error.statusCode = 403
      throw error
    }

    if (!line.parcelPool.includes(parcelId)) {
      const error = new Error('Parcel is unavailable on this line')
      error.statusCode = 409
      throw error
    }

    const carriage = line.carriages.find((entry) => entry.id === carriageId)
    if (!carriage) {
      const error = new Error('Carriage not found')
      error.statusCode = 404
      throw error
    }

    if (carriage.loadedParcelIds.length >= carriage.requiredParcels) {
      const error = new Error('Carriage is already full')
      error.statusCode = 409
      throw error
    }

    carriage.loadedParcelIds.push(parcelId)
    line.parcelPool = line.parcelPool.filter((id) => id !== parcelId)

    await this.storage.writeData(db)
    return buildPublicTeam(team)
  }

  async playLine({ teamCode, playerId, lineId }) {
    const normalizedCode = String(teamCode ?? '').trim().toUpperCase()
    const db = await this.storage.readData()
    const team = db.teams[normalizedCode]
    if (!team) {
      const error = new Error('Team not found')
      error.statusCode = 404
      throw error
    }

    const player = ensurePlayerOnTeam(team, playerId)

    if (team.status !== 'active' || !team.game) {
      const error = new Error('Game is not active')
      error.statusCode = 409
      throw error
    }

    const line = team.game.lines.find((entry) => entry.id === lineId)
    if (!line) {
      const error = new Error('Line not found')
      error.statusCode = 404
      throw error
    }

    if (line.status !== 'loading') {
      const error = new Error('This line has already shipped')
      error.statusCode = 409
      throw error
    }

    if (line.activePlayerId !== playerId) {
      const error = new Error('Only the active player can dispatch this line')
      error.statusCode = 403
      throw error
    }

    const playedAt = this.now()
    const elapsedSeconds = Math.floor(
      (playedAt.getTime() - new Date(team.game.startedAt).getTime()) / 1000,
    )

    team.game.scoreEvents.push({
      id: randomUUID(),
      lineId,
      playerId,
      playerName: player.name,
      parcelsShipped: lineCapacity(line),
      playedAt: playedAt.toISOString(),
      elapsedSeconds,
    })

    const currentPlayerIndex = team.game.playerOrder.indexOf(line.activePlayerId)
    if (currentPlayerIndex < 0) {
      const error = new Error('Active player is not in the play order')
      error.statusCode = 500
      throw error
    }

    line.status = 'departed'

    if (hasRemainingTurnsForLine(line, team.game.playerOrder.length)) {
      const nextPlayerIndex = currentPlayerIndex + 1
      const nextPlayerId = team.game.playerOrder[nextPlayerIndex]

      line.cycleCount += 1
      line.status = 'loading'
      line.activePlayerId = nextPlayerId
      line.carriages = line.carriages.map((carriage) => ({
        ...carriage,
        loadedParcelIds: [],
      }))

      const capacity = lineCapacity(line)
      const parcelResult = createParcelIdsForLine(
        line.id,
        capacity,
        team.game.nextParcelSequence,
      )
      line.parcelPool = parcelResult.parcelIds
      line.parcelSlots = [...parcelResult.parcelIds]
      team.game.nextParcelSequence = parcelResult.nextParcelSequence
    } else {
      line.activePlayerId = null
      line.parcelPool = []
      line.parcelSlots = []
    }

    const allLinesDeparted = team.game.lines.every(
      (entry) => entry.status === 'departed',
    )

    if (allLinesDeparted) {
      team.status = 'completed'
      team.game.completedAt = playedAt.toISOString()
    }

    await this.storage.writeData(db)
    return buildPublicTeam(team)
  }

  async restartGame({ teamCode, playerId }) {
    const normalizedCode = String(teamCode ?? '').trim().toUpperCase()
    const db = await this.storage.readData()
    const team = db.teams[normalizedCode]
    if (!team) {
      const error = new Error('Team not found')
      error.statusCode = 404
      throw error
    }

    ensurePlayerOnTeam(team, playerId)

    // Idempotent so concurrent clicks/polls returning the team to the lobby
    // don't error out the losers of the race.
    if (team.status === 'lobby') {
      return buildPublicTeam(team)
    }

    if (team.status !== 'completed') {
      const error = new Error('Finish the current game before starting again')
      error.statusCode = 409
      throw error
    }

    if (team.game) {
      team.games = team.games ?? []
      team.games.push(summarizeGame(team.game))
    }

    team.status = 'lobby'
    team.game = null
    team.startedAt = null

    await this.storage.writeData(db)
    return buildPublicTeam(team)
  }
}
