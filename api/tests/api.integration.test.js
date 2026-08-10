import os from 'node:os'
import path from 'node:path'
import { rm } from 'node:fs/promises'
import request from 'supertest'
import { createApiApp } from '../app.js'

describe('Delivery API integration', () => {
  let app
  let dbPath

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `delivery-api-int-${Date.now()}-${Math.random()}.json`)
    app = createApiApp({ dbPath })
  })

  afterEach(async () => {
    await rm(dbPath, { force: true })
  })

  it('creates team, joins, starts game, loads and plays train', async () => {
    const createResponse = await request(app)
      .post('/api/teams')
      .send({ name: 'Host', teamName: 'Platform Crew', origin: 'http://localhost:4173' })
      .expect(201)

    const teamCode = createResponse.body.team.code
    const hostId = createResponse.body.session.playerId

    expect(createResponse.body.team.name).toBe('Platform Crew')

    const fetched = await request(app).get(`/api/teams/${teamCode}`).expect(200)
    expect(fetched.body.team.name).toBe('Platform Crew')

    await request(app)
      .post('/api/teams/join')
      .send({ teamCode, name: 'Guest' })
      .expect(200)

    const started = await request(app)
      .post(`/api/teams/${teamCode}/start`)
      .send({
        playerId: hostId,
        lineCount: 1,
        totalCarriages: 2,
        parcelsPerCarriage: 1,
      })
      .expect(200)

    let team = started.body.team
    const line = team.game.lines[0]
    const activePlayerId = line.activePlayerId

    const loadFirst = await request(app)
      .post(`/api/teams/${teamCode}/load`)
      .send({
        playerId: activePlayerId,
        lineId: 'line-1',
        carriageId: line.carriages[0].id,
        parcelId: line.parcelPool[0],
      })
      .expect(200)

    team = loadFirst.body.team

    const loadSecond = await request(app)
      .post(`/api/teams/${teamCode}/load`)
      .send({
        playerId: activePlayerId,
        lineId: 'line-1',
        carriageId: line.carriages[1].id,
        parcelId: team.game.lines[0].parcelPool[0],
      })
      .expect(200)

    expect(loadSecond.body.team.game.lines[0].carriages[1].loadedParcelIds).toHaveLength(1)

    await request(app)
      .post(`/api/teams/${teamCode}/play`)
      .send({ playerId: activePlayerId, lineId: 'line-1' })
      .expect(200)

    const stats = await request(app).get(`/api/teams/${teamCode}/stats`).expect(200)
    expect(stats.body.scoreEvents).toHaveLength(1)
    expect(stats.body.scoreEvents[0].parcelsShipped).toBe(2)

    await request(app)
      .post(`/api/teams/${teamCode}/play`)
      .send({ playerId: activePlayerId, lineId: 'line-1' })
      .expect(403)
  })

  it('rejects team creation without a team name', async () => {
    const response = await request(app)
      .post('/api/teams')
      .send({ name: 'Host', origin: 'http://localhost:4173' })
      .expect(400)

    expect(response.body.error).toMatch(/Team name is required/)

    await request(app)
      .post('/api/teams')
      .send({ name: 'Host', teamName: '   ', origin: 'http://localhost:4173' })
      .expect(400)
  })

  it('completes one-player game after last line ships', async () => {
    const createResponse = await request(app)
      .post('/api/teams')
      .send({ name: 'Solo', teamName: 'Solo Crew', origin: 'http://localhost:4173' })
      .expect(201)

    const teamCode = createResponse.body.team.code
    const soloId = createResponse.body.session.playerId

    let started = await request(app)
      .post(`/api/teams/${teamCode}/start`)
      .send({
        playerId: soloId,
        lineCount: 2,
        totalCarriages: 2,
        parcelsPerCarriage: 1,
      })
      .expect(200)

    for (const lineId of ['line-1', 'line-2']) {
      const line = started.body.team.game.lines.find((entry) => entry.id === lineId)

      started = await request(app)
        .post(`/api/teams/${teamCode}/load`)
        .send({
          playerId: soloId,
          lineId,
          carriageId: line.carriages[0].id,
          parcelId: line.parcelPool[0],
        })
        .expect(200)

      started = await request(app)
        .post(`/api/teams/${teamCode}/play`)
        .send({ playerId: soloId, lineId })
        .expect(200)
    }

    expect(started.body.team.status).toBe('completed')
    expect(
      started.body.team.game.lines.every((line) => line.status === 'departed'),
    ).toBe(true)
  })

  it('restarts a completed game back to the lobby and tracks games separately', async () => {
    const createResponse = await request(app)
      .post('/api/teams')
      .send({ name: 'Solo', teamName: 'Replay Crew', origin: 'http://localhost:4173' })
      .expect(201)

    const teamCode = createResponse.body.team.code
    const soloId = createResponse.body.session.playerId

    async function playSingleLineGame() {
      let state = await request(app)
        .post(`/api/teams/${teamCode}/start`)
        .send({ playerId: soloId, lineCount: 1, totalCarriages: 1, parcelsPerCarriage: 1 })
        .expect(200)

      const line = state.body.team.game.lines[0]
      await request(app)
        .post(`/api/teams/${teamCode}/load`)
        .send({
          playerId: soloId,
          lineId: 'line-1',
          carriageId: line.carriages[0].id,
          parcelId: line.parcelPool[0],
        })
        .expect(200)

      state = await request(app)
        .post(`/api/teams/${teamCode}/play`)
        .send({ playerId: soloId, lineId: 'line-1' })
        .expect(200)

      return state
    }

    const firstGame = await playSingleLineGame()
    expect(firstGame.body.team.status).toBe('completed')
    expect(firstGame.body.team.game.gameNumber).toBe(1)

    const restarted = await request(app)
      .post(`/api/teams/${teamCode}/restart`)
      .send({ playerId: soloId })
      .expect(200)

    expect(restarted.body.team.status).toBe('lobby')
    expect(restarted.body.team.name).toBe('Replay Crew')
    expect(restarted.body.team.games).toHaveLength(1)

    const secondGame = await playSingleLineGame()
    expect(secondGame.body.team.game.gameNumber).toBe(2)

    const stats = await request(app).get(`/api/teams/${teamCode}/stats`).expect(200)
    expect(stats.body.games).toHaveLength(2)
    expect(stats.body.games.map((game) => game.gameNumber)).toEqual([1, 2])
  })

  it('exposes the whole teams data blob for reporting', async () => {
    const empty = await request(app).get('/api/data').expect(200)
    expect(empty.body).toEqual({ teams: {} })

    const createResponse = await request(app)
      .post('/api/teams')
      .send({ name: 'Host', teamName: 'Report Crew', origin: 'http://localhost:4173' })
      .expect(201)

    const teamCode = createResponse.body.team.code

    const populated = await request(app).get('/api/data').expect(200)
    expect(populated.body.teams[teamCode]).toBeDefined()
    expect(populated.body.teams[teamCode].name).toBe('Report Crew')
  })

  it('serves the static report page', async () => {
    const response = await request(app).get('/report').expect(200)
    expect(response.headers['content-type']).toMatch(/text\/html/)
    expect(response.text).toMatch(/Delivery Rails · Team Stats/)
  })

  it('mounts every route under a configurable base path', async () => {
    const scopedApp = createApiApp({ dbPath, basePath: 'delivery/' })

    await request(scopedApp).get('/delivery/api/health').expect(200)
    await request(scopedApp).get('/delivery/api/data').expect(200)
    await request(scopedApp).get('/delivery/report').expect(200)

    // The unprefixed root paths no longer resolve when a base path is set.
    await request(scopedApp).get('/api/health').expect(404)
  })
})
