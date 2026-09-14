// Set VITE_API_BASE_URL at build time to point the app at a different API host
// (e.g. in production). Empty default keeps same-origin/relative requests, which
// the dev server proxy handles.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const SESSION_STORAGE_KEY = 'delivery-training-session'

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
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

export function getStoredSession() {
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) ?? 'null')
  } catch {
    return null
  }
}

export function storeSession(session) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY)
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

export function getAdminOverview() {
  return request('/api/admin/overview')
}

export function cancelTeam({ teamCode }) {
  return request(`/api/admin/teams/${teamCode}/cancel`, { method: 'POST' })
}
