async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error ?? 'Request failed')
  }

  return payload
}

export function createTeam({ name, teamName, origin }) {
  return request('/api/teams', {
    method: 'POST',
    body: { name, teamName, origin },
  })
}

export function joinTeam({ name, teamCode }) {
  return request('/api/teams/join', {
    method: 'POST',
    body: { name, teamCode },
  })
}

export function getTeam(teamCode) {
  return request(`/api/teams/${teamCode}`)
}

export function startGame({
  teamCode,
  playerId,
  lineCount,
  totalCarriages,
  parcelsPerCarriage,
}) {
  return request(`/api/teams/${teamCode}/start`, {
    method: 'POST',
    body: {
      playerId,
      lineCount,
      totalCarriages,
      parcelsPerCarriage,
    },
  })
}

export function loadParcel({ teamCode, playerId, lineId, carriageId, parcelId }) {
  return request(`/api/teams/${teamCode}/load`, {
    method: 'POST',
    body: { playerId, lineId, carriageId, parcelId },
  })
}

export function playLine({ teamCode, playerId, lineId }) {
  return request(`/api/teams/${teamCode}/play`, {
    method: 'POST',
    body: { playerId, lineId },
  })
}

export function restartGame({ teamCode, playerId }) {
  return request(`/api/teams/${teamCode}/restart`, {
    method: 'POST',
    body: { playerId },
  })
}
