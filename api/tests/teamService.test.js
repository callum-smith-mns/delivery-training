import os from 'node:os'
import path from 'node:path'
import { rm } from 'node:fs/promises'
import { FileStorage } from '../lib/storage.js'
import { TeamService } from '../service/teamService.js'

function makeNowFactory() {
  const start = new Date('2026-08-05T10:00:00.000Z').getTime()
  let tick = 0
  return () => new Date(start + tick++ * 1000)
}

describe('TeamService', () => {
  let service
  let dbPath

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `delivery-api-unit-${Date.now()}-${Math.random()}.json`)
    service = new TeamService({
      storage: new FileStorage(dbPath),
      now: makeNowFactory(),
      randomValue: () => 0,
    })
  })

  afterEach(async () => {
    await rm(dbPath, { force: true })
  })

  it('creates and joins teams', async () => {
    const created = await service.createTeam({ playerName: 'Host', teamName: 'Crew', origin: 'http://localhost:4173' })
    expect(created.team.code).toHaveLength(8)
    expect(created.team.players).toHaveLength(1)

    const joined = await service.joinTeam({ teamCode: created.team.code, playerName: 'Guest' })
    expect(joined.team.players).toHaveLength(2)
  })

  it('rejoins the existing player instead of creating a duplicate', async () => {
    const created = await service.createTeam({ playerName: 'Host', teamName: 'Crew' })

    const firstJoin = await service.joinTeam({
      teamCode: created.team.code,
      playerName: 'Guest',
    })
    const secondJoin = await service.joinTeam({
      teamCode: created.team.code,
      playerName: ' guest ',
    })

    expect(secondJoin.rejoined).toBe(true)
    expect(secondJoin.session.playerId).toBe(firstJoin.session.playerId)
    expect(secondJoin.team.players).toHaveLength(2)
  })

  it('lets an existing player rejoin an active game', async () => {
    const created = await service.createTeam({ playerName: 'Host', teamName: 'Crew' })
    await service.startGame({
      teamCode: created.team.code,
      playerId: created.session.playerId,
      lineCount: 1,
      totalCarriages: 1,
      parcelsPerCarriage: 1,
    })

    const rejoined = await service.joinTeam({
      teamCode: created.team.code,
      playerName: 'host',
    })

    expect(rejoined.rejoined).toBe(true)
    expect(rejoined.session.playerId).toBe(created.session.playerId)
  })

  it('reports live team counts and statuses for admin views', async () => {
    let randomIndex = 0
    service.randomValue = () => ((randomIndex++ % 36) + 0.1) / 36
    const lobby = await service.createTeam({ playerName: 'Lobby', teamName: 'Lobby Crew' })
    const active = await service.createTeam({ playerName: 'Active', teamName: 'Active Crew' })
    await service.startGame({
      teamCode: active.team.code,
      playerId: active.session.playerId,
      lineCount: 1,
      totalCarriages: 1,
      parcelsPerCarriage: 1,
    })

    const overview = await service.getAdminOverview()

    expect(overview.counts).toMatchObject({ total: 2, lobby: 1, active: 1 })
    expect(overview.teams.map((team) => team.code)).toEqual(
      expect.arrayContaining([lobby.team.code, active.team.code]),
    )
  })

  it('requires a team name when creating a team', async () => {
    await expect(
      service.createTeam({ playerName: 'Host' }),
    ).rejects.toThrow(/Team name is required/)

    await expect(
      service.createTeam({ playerName: 'Host', teamName: '   ' }),
    ).rejects.toThrow(/Team name is required/)
  })

  it('starts game and records play events', async () => {
    const created = await service.createTeam({ playerName: 'Host', teamName: 'Crew' })
    const hostId = created.session.playerId
    await service.joinTeam({ teamCode: created.team.code, playerName: 'Guest' })

    const started = await service.startGame({
      teamCode: created.team.code,
      playerId: hostId,
      lineCount: 2,
      totalCarriages: 5,
      parcelsPerCarriage: 1,
    })

    expect(started.status).toBe('active')
    expect(started.game.lines).toHaveLength(2)
    expect(started.game.lines[0].carriages).toHaveLength(3)
    expect(started.game.lines[1].carriages).toHaveLength(2)

    const line = started.game.lines[0]
    let current = started
    for (const carriage of line.carriages) {
      const parcelId = current.game.lines[0].parcelPool[0]
      current = await service.loadParcel({
        teamCode: created.team.code,
        playerId: current.game.lines[0].activePlayerId,
        lineId: 'line-1',
        carriageId: carriage.id,
        parcelId,
      })
    }

    const activePlayer = current.game.lines[0].activePlayerId
    const played = await service.playLine({
      teamCode: created.team.code,
      playerId: activePlayer,
      lineId: 'line-1',
    })

    expect(played.game.scoreEvents).toHaveLength(1)
    expect(played.game.scoreEvents[0].lineId).toBe('line-1')
    expect(played.game.lines[0].activePlayerId).not.toBe(activePlayer)
  })

  it('completes a line after each player has had one turn', async () => {
    const created = await service.createTeam({ playerName: 'Host', teamName: 'Crew' })
    const hostId = created.session.playerId
    await service.joinTeam({ teamCode: created.team.code, playerName: 'Guest' })

    let state = await service.startGame({
      teamCode: created.team.code,
      playerId: hostId,
      lineCount: 1,
      totalCarriages: 1,
      parcelsPerCarriage: 1,
    })

    const firstPlayerId = state.game.lines[0].activePlayerId
    state = await service.loadParcel({
      teamCode: created.team.code,
      playerId: firstPlayerId,
      lineId: 'line-1',
      carriageId: state.game.lines[0].carriages[0].id,
      parcelId: state.game.lines[0].parcelPool[0],
    })

    state = await service.playLine({
      teamCode: created.team.code,
      playerId: firstPlayerId,
      lineId: 'line-1',
    })

    const secondPlayerId = state.game.lines[0].activePlayerId
    expect(secondPlayerId).not.toBe(firstPlayerId)

    state = await service.loadParcel({
      teamCode: created.team.code,
      playerId: secondPlayerId,
      lineId: 'line-1',
      carriageId: state.game.lines[0].carriages[0].id,
      parcelId: state.game.lines[0].parcelPool[0],
    })

    state = await service.playLine({
      teamCode: created.team.code,
      playerId: secondPlayerId,
      lineId: 'line-1',
    })

    expect(state.status).toBe('completed')
    expect(state.game.lines[0].status).toBe('departed')
    expect(state.game.lines[0].activePlayerId).toBeNull()
    expect(state.game.scoreEvents).toHaveLength(2)
  })

  it('supports one-player game and completes after final line ships', async () => {
    const created = await service.createTeam({ playerName: 'Solo', teamName: 'Crew' })
    const soloId = created.session.playerId

    let state = await service.startGame({
      teamCode: created.team.code,
      playerId: soloId,
      lineCount: 2,
      totalCarriages: 2,
      parcelsPerCarriage: 1,
    })

    for (const lineId of ['line-1', 'line-2']) {
      const line = state.game.lines.find((entry) => entry.id === lineId)
      state = await service.loadParcel({
        teamCode: created.team.code,
        playerId: soloId,
        lineId,
        carriageId: line.carriages[0].id,
        parcelId: line.parcelPool[0],
      })

      state = await service.playLine({
        teamCode: created.team.code,
        playerId: soloId,
        lineId,
      })
    }

    expect(state.status).toBe('completed')
    expect(state.game.lines.every((line) => line.status === 'departed')).toBe(true)
    expect(state.game.scoreEvents).toHaveLength(2)
  })

  it('restarts to the lobby and tracks each game separately', async () => {
    const created = await service.createTeam({ playerName: 'Solo', teamName: 'Crew' })
    const soloId = created.session.playerId

    async function playSingleLineGame() {
      let state = await service.startGame({
        teamCode: created.team.code,
        playerId: soloId,
        lineCount: 1,
        totalCarriages: 1,
        parcelsPerCarriage: 1,
      })
      state = await service.loadParcel({
        teamCode: created.team.code,
        playerId: soloId,
        lineId: 'line-1',
        carriageId: state.game.lines[0].carriages[0].id,
        parcelId: state.game.lines[0].parcelPool[0],
      })
      return service.playLine({
        teamCode: created.team.code,
        playerId: soloId,
        lineId: 'line-1',
      })
    }

    const firstGame = await playSingleLineGame()
    expect(firstGame.status).toBe('completed')
    expect(firstGame.game.gameNumber).toBe(1)

    const backToLobby = await service.restartGame({
      teamCode: created.team.code,
      playerId: soloId,
    })
    expect(backToLobby.status).toBe('lobby')
    expect(backToLobby.game).toBeNull()
    expect(backToLobby.games).toHaveLength(1)
    expect(backToLobby.games[0].gameNumber).toBe(1)
    expect(backToLobby.games[0].parcelsShipped).toBe(1)

    const secondGame = await playSingleLineGame()
    expect(secondGame.status).toBe('completed')
    expect(secondGame.game.gameNumber).toBe(2)
    // The new game starts with its own, separate score log.
    expect(secondGame.game.scoreEvents).toHaveLength(1)
    expect(secondGame.games).toHaveLength(1)

    const finalLobby = await service.restartGame({
      teamCode: created.team.code,
      playerId: soloId,
    })
    expect(finalLobby.games).toHaveLength(2)
    expect(finalLobby.games.map((game) => game.gameNumber)).toEqual([1, 2])
  })

  it('rejects restart while a game is still active', async () => {
    const created = await service.createTeam({ playerName: 'Solo', teamName: 'Crew' })
    const soloId = created.session.playerId

    await service.startGame({
      teamCode: created.team.code,
      playerId: soloId,
      lineCount: 1,
      totalCarriages: 1,
      parcelsPerCarriage: 1,
    })

    await expect(
      service.restartGame({ teamCode: created.team.code, playerId: soloId }),
    ).rejects.toThrow(/Finish the current game/)
  })

  it('closes an open game without archiving its unfinished data', async () => {
    const created = await service.createTeam({ playerName: 'Solo', teamName: 'Crew' })
    const soloId = created.session.playerId

    await service.startGame({
      teamCode: created.team.code,
      playerId: soloId,
      lineCount: 1,
      totalCarriages: 1,
      parcelsPerCarriage: 1,
    })

    const closed = await service.closeOpenGame({ teamCode: created.team.code })

    expect(closed.status).toBe('lobby')
    expect(closed.game).toBeNull()
    expect(closed.games).toEqual([])
    expect(closed.startedAt).toBeNull()
    expect(closed.gameCount).toBe(1)
  })

  it('only closes an active game', async () => {
    const created = await service.createTeam({ playerName: 'Solo', teamName: 'Crew' })

    await expect(
      service.closeOpenGame({ teamCode: created.team.code }),
    ).rejects.toThrow(/does not have an open game/)

    await expect(
      service.closeOpenGame({ teamCode: 'MISSING1' }),
    ).rejects.toThrow(/Team not found/)
  })
})
