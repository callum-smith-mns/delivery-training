import { describe, expect, it } from 'vitest'
import { analyzeTeams, stddev } from './analysis'

function game(gameNumber, events) {
  return {
    gameNumber,
    startedAt: '2026-01-01T00:00:00.000Z',
    scoreEvents: events,
  }
}

function event(lineId, playerId, playerName, elapsedSeconds, parcelsShipped) {
  return { lineId, playerId, playerName, elapsedSeconds, parcelsShipped, playedAt: `2026-01-01T00:00:${String(elapsedSeconds).padStart(2, '0')}.000Z` }
}

describe('stats analysis', () => {
  it('groups completed games and calculates delivery, flow, and repeatability metrics', () => {
    const teams = analyzeTeams({ teams: {
      ZED: {
        code: 'ZED',
        name: 'Zed Team',
        games: [
          game(1, [event('line-1', 'p1', 'Ada', 10, 2), event('line-1', 'p2', 'Bea', 20, 2)]),
          game(2, [event('line-1', 'p1', 'Ada', 14, 2), event('line-1', 'p2', 'Bea', 26, 2)]),
        ],
      },
    } })

    expect(teams).toHaveLength(1)
    const group = teams[0].groups[0]
    expect(group.lineCount).toBe(1)
    expect(group.firstMean).toBe(23)
    expect(group.completionMean).toBe(23)
    expect(group.completionStddev).toBeCloseTo(Math.sqrt(18))
    expect(group.timeline[0]).toMatchObject({ seconds: 23, cumulativeParcels: 2 })
    expect(group.flow).toHaveLength(2)
    expect(group.flow[0].playerName).toBe('Ada')
    expect(group.flow[1].isFinal).toBe(true)
  })

  it('uses sample standard deviation and ignores teams without completed events', () => {
    expect(stddev([10, 14])).toBeCloseTo(Math.sqrt(8))
    expect(analyzeTeams({ teams: { EMPTY: { code: 'EMPTY', games: [] } } })).toEqual([])
  })
})
