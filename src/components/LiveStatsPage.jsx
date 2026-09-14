import { useEffect, useState } from 'react'
import { cancelTeam, getAdminOverview } from '../api/client'
import { analyzeTeams } from '../stats/analysis'
import { StatsGroup, StatsOverview } from './StatsCharts'

const ADMIN_PASSWORD = 'TheConductorIsHere'

function LiveStatsPage({ admin = false }) {
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [overview, setOverview] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCode, setSelectedCode] = useState('')

  useEffect(() => {
    if (!isAuthorized) {
      return undefined
    }

    let isAlive = true

    async function refresh() {
      try {
        const nextOverview = await getAdminOverview()
        if (isAlive) {
          setOverview(nextOverview)
          setError('')
          setIsLoading(false)
        }
      } catch (requestError) {
        if (isAlive) {
          setError(requestError.message)
          setIsLoading(false)
        }
      }
    }

    refresh()
    const intervalId = window.setInterval(refresh, 5000)
    return () => {
      isAlive = false
      window.clearInterval(intervalId)
    }
  }, [isAuthorized])

  function handleUnlock(event) {
    event.preventDefault()
    if (password !== ADMIN_PASSWORD) {
      setPasswordError('Incorrect password.')
      return
    }

    setPasswordError('')
    setIsAuthorized(true)
    setIsLoading(true)
  }

  async function handleCancel(teamCode) {
    try {
      const payload = await cancelTeam({ teamCode })
      setOverview((current) => ({
        ...current,
        counts: {
          ...current.counts,
          active: Math.max(0, current.counts.active - 1),
          lobby: current.counts.lobby + 1,
        },
        teams: current.teams.map((team) =>
          team.code === teamCode ? payload.team : team,
        ),
      }))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const title = admin ? 'Session Admin' : 'Live Statistics'

  if (!isAuthorized) {
    return (
      <main className="game-screen" data-testid="protected-screen">
        <header className="game-header">
          <h1>{title}</h1>
          <p>Enter the access password to continue.</p>
        </header>
        <form className="setup-panel" aria-label="Protected screen access" onSubmit={handleUnlock}>
          <label htmlFor="protected-password">Password</label>
          <input
            id="protected-password"
            className="setup-input"
            data-testid="protected-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
          />
          <button className="start-button" data-testid="unlock-protected-view" type="submit">
            Enter
          </button>
          {passwordError ? (
            <p className="error-message" data-testid="protected-access-error">
              {passwordError}
            </p>
          ) : null}
        </form>
      </main>
    )
  }

  const analyzedTeams = overview ? analyzeTeams({ teams: Object.fromEntries(overview.teams.map((team) => [team.code, team])) }) : []
  const selectedTeam = analyzedTeams.find((team) => team.code === selectedCode) ?? analyzedTeams[0]

  return (
    <main className={`game-screen ${admin ? '' : 'stats-report-screen'}`} data-testid={admin ? 'admin-page' : 'stats-page'}>
      <header className="game-header">
        <h1>{title}</h1>
        <p>{admin ? 'Live session data refreshes automatically.' : 'Live analysis of every team\'s relay performance.'}</p>
      </header>
      {isLoading ? <p>Loading session data...</p> : null}
      {error ? <p className="error-message">{error}</p> : null}
      {overview && !admin ? (
        <>
          <div className="stats-toolbar">
            <label htmlFor="stats-team-filter">Team</label>
            <select id="stats-team-filter" data-testid="stats-team-filter" value={selectedTeam?.code ?? ''} onChange={(event) => setSelectedCode(event.target.value)}>
              {analyzedTeams.map((team) => <option key={team.code} value={team.code}>{team.name} ({team.code})</option>)}
            </select>
            <span>Completed games: {selectedTeam?.gameCount ?? 0}</span>
          </div>
          {selectedTeam ? <>
            <StatsOverview team={selectedTeam} color="#5a1f00" />
            <section className="stats-panel">
              <h2>{selectedTeam.name}</h2>
              <p className="stats-caption">Team code {selectedTeam.code} · grouped by number of lines shipped.</p>
              {selectedTeam.groups.map((group) => <StatsGroup key={group.lineCount} group={group} color="#5a1f00" />)}
            </section>
          </> : <section className="stats-panel"><p>No completed games yet. Play a delivery run, then refresh.</p></section>}
        </>
      ) : overview ? (
        <>
          <section className="score-board" aria-label="Session summary">
            <h2>Teams In Session</h2>
            <p className="score-total" data-testid="active-team-count">
              {overview.counts.active}
            </p>
            <p data-testid="team-status-counts">
              {overview.counts.lobby} lobby, {overview.counts.completed} completed,{' '}
              {overview.counts.total} total
            </p>
          </section>
          <section className="setup-panel" aria-label="Teams">
            <h2>Teams</h2>
            {overview.teams.length === 0 ? <p>No teams recorded.</p> : null}
            {overview.teams.map((team) => (
              <article className="team-admin-row" key={team.code}>
                <strong>{team.name}</strong>
                <span>{team.code}</span>
                <span data-testid={`team-status-${team.code}`}>{team.status}</span>
                <span>{team.players.length} players</span>
                {admin && team.status === 'active' ? (
                  <button
                    type="button"
                    className="start-button"
                    data-testid={`cancel-team-${team.code}`}
                    onClick={() => handleCancel(team.code)}
                  >
                    Cancel session
                  </button>
                ) : null}
              </article>
            ))}
          </section>
        </>
      ) : null}
    </main>
  )
}

export default LiveStatsPage