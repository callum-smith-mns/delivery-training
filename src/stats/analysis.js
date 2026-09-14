function secondsBetween(start, end) {
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 1000))
}

export function mean(values) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function stddev(values) {
  if (values.length < 2) return 0
  const average = mean(values)
  const variance = values.reduce(
    (sum, value) => sum + (value - average) ** 2,
    0,
  ) / (values.length - 1)
  return Math.sqrt(variance)
}

function completedGamesForTeam(team) {
  const archived = Array.isArray(team.games) ? team.games : []
  const currentCompleted =
    team.game && (team.status === 'completed' || team.game.completedAt)
      ? [team.game]
      : []
  return [...archived, ...currentCompleted].filter(
    (game) => Array.isArray(game.scoreEvents) && game.scoreEvents.length > 0,
  )
}

function analyzeGame(game) {
  const events = [...game.scoreEvents].sort(
    (a, b) => new Date(a.playedAt) - new Date(b.playedAt),
  )
  const lineIds = [...new Set(events.map((event) => event.lineId))]
  const playerIds = [...new Set(events.map((event) => event.playerId))]
  const deliveries = lineIds
    .map((lineId) => {
      const lineEvents = events.filter((event) => event.lineId === lineId)
      const last = lineEvents[lineEvents.length - 1]
      const seconds = typeof last.elapsedSeconds === 'number'
        ? last.elapsedSeconds
        : secondsBetween(game.startedAt, last.playedAt)
      return { lineId, seconds, parcels: last.parcelsShipped ?? 0 }
    })
    .sort((a, b) => a.seconds - b.seconds)

  let cumulative = 0
  const timeline = deliveries.map((delivery) => {
    cumulative += delivery.parcels
    return { seconds: delivery.seconds, cumulativeParcels: cumulative }
  })

  const eventsByLine = new Map()
  for (const event of events) {
    if (!eventsByLine.has(event.lineId)) eventsByLine.set(event.lineId, [])
    eventsByLine.get(event.lineId).push(event)
  }
  const positionCount = Math.max(
    0,
    ...[...eventsByLine.values()].map((list) => list.length),
  )
  const memberFlows = []
  for (let position = 0; position < positionCount; position += 1) {
    const handoffs = []
    for (const list of eventsByLine.values()) {
      const event = list[position]
      if (!event) continue
      const seconds = typeof event.elapsedSeconds === 'number'
        ? event.elapsedSeconds
        : secondsBetween(game.startedAt, event.playedAt)
      handoffs.push({ seconds, parcels: event.parcelsShipped ?? 0, playerName: event.playerName })
    }
    handoffs.sort((a, b) => a.seconds - b.seconds)
    let running = 0
    const points = handoffs.map((handoff) => {
      running += handoff.parcels
      return { seconds: handoff.seconds, cumulativeParcels: running }
    })
    memberFlows.push({ position, points, playerName: handoffs[0]?.playerName ?? null })
  }

  return {
    gameNumber: game.gameNumber ?? null,
    lineCount: lineIds.length,
    playerCount: playerIds.length,
    firstDelivery: Math.min(...deliveries.map((delivery) => delivery.seconds)),
    completion: Math.max(...deliveries.map((delivery) => delivery.seconds)),
    deliveries,
    timeline,
    memberFlows,
  }
}

function analyzeGroup(lineCount, games) {
  const timeline = []
  for (let index = 0; index < lineCount; index += 1) {
    const seconds = games.map((game) => game.deliveries[index].seconds)
    const cumulativeParcels = games.map((game) => game.timeline[index].cumulativeParcels)
    timeline.push({
      index: index + 1,
      seconds: mean(seconds),
      secondsStddev: stddev(seconds),
      cumulativeParcels: mean(cumulativeParcels),
    })
  }

  const memberCount = Math.max(0, ...games.map((game) => game.memberFlows.length))
  const flow = []
  for (let position = 0; position < memberCount; position += 1) {
    const members = games.map((game) => game.memberFlows[position]).filter(Boolean)
    const points = []
    for (let index = 0; index < lineCount; index += 1) {
      const seconds = members.map((member) => member.points[index]?.seconds).filter((value) => value != null)
      const cumulativeParcels = members.map((member) => member.points[index]?.cumulativeParcels).filter((value) => value != null)
      if (seconds.length === 0) continue
      points.push({ seconds: mean(seconds), secondsStddev: stddev(seconds), cumulativeParcels: mean(cumulativeParcels) })
    }
    flow.push({
      position,
      playerName: members[0]?.playerName ?? null,
      isFinal: position === memberCount - 1,
      points,
    })
  }

  const firstValues = games.map((game) => game.firstDelivery)
  const completionValues = games.map((game) => game.completion)
  return {
    lineCount,
    games,
    firstMean: mean(firstValues),
    firstStddev: stddev(firstValues),
    completionMean: mean(completionValues),
    completionStddev: stddev(completionValues),
    timeline,
    flow,
    memberCount,
  }
}

export function analyzeTeams(data) {
  const teams = data?.teams ? Object.values(data.teams) : []
  return teams.map((team) => {
    const games = completedGamesForTeam(team).map(analyzeGame)
    const byLineCount = new Map()
    games.forEach((game) => {
      if (!byLineCount.has(game.lineCount)) byLineCount.set(game.lineCount, [])
      byLineCount.get(game.lineCount).push(game)
    })
    return {
      code: team.code,
      name: team.name || team.code,
      groups: [...byLineCount.entries()]
        .sort(([left], [right]) => left - right)
        .map(([lineCount, groupGames]) => analyzeGroup(lineCount, groupGames)),
      gameCount: games.length,
    }
  }).filter((team) => team.gameCount > 0).sort((left, right) => left.name.localeCompare(right.name))
}