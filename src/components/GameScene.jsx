import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  createTeam,
  clearStoredSession,
  getTeam,
  getStoredSession,
  joinTeam,
  playLine,
  restartGame,
  startGame,
  storeSession,
} from '../api/client'
import Platform from './Platform'
import { ParcelBox } from './Parcel'
import ScoreBoard from './ScoreBoard'
import TrainYard from './TrainYard'
import {
  distributeCarriagesAcrossLines,
  isLineReadyToShip,
} from '../game/config'

const EDGE_SCROLL_THRESHOLD = 80
const MAX_EDGE_SCROLL_SPEED = 18

export function getTeamUrl(teamCode) {
  const url = new URL(window.location.href)
  url.searchParams.set('team', teamCode)
  return url.href
}

export function getEdgeScrollDelta(pointerY, viewportHeight) {
  if (pointerY <= EDGE_SCROLL_THRESHOLD) {
    return -Math.min(
      MAX_EDGE_SCROLL_SPEED,
      Math.max(1, EDGE_SCROLL_THRESHOLD - pointerY),
    )
  }

  if (pointerY >= viewportHeight - EDGE_SCROLL_THRESHOLD) {
    return Math.min(
      MAX_EDGE_SCROLL_SPEED,
      Math.max(1, pointerY - (viewportHeight - EDGE_SCROLL_THRESHOLD)),
    )
  }

  return 0
}

// Scroll a line's carriages horizontally when the pointer nears its left/right
// edge, so a parcel can be dragged onto carriages that sit off-screen.
export function getHorizontalEdgeScrollDelta(pointerX, rectLeft, rectRight) {
  const fromLeft = pointerX - rectLeft
  const fromRight = rectRight - pointerX

  if (fromLeft <= EDGE_SCROLL_THRESHOLD) {
    return -Math.min(
      MAX_EDGE_SCROLL_SPEED,
      Math.max(1, EDGE_SCROLL_THRESHOLD - fromLeft),
    )
  }

  if (fromRight <= EDGE_SCROLL_THRESHOLD) {
    return Math.min(
      MAX_EDGE_SCROLL_SPEED,
      Math.max(1, EDGE_SCROLL_THRESHOLD - fromRight),
    )
  }

  return 0
}

// Only carriages the parcel actually overlaps are eligible (so dropping over
// empty space or a full/disabled carriage loads nothing), and among those the
// one whose centre is closest to the parcel wins. This lets any empty carriage
// on any line be filled in any order, instead of an upper line's carriage
// "winning" purely on rect-overlap area.
function resolveCollisions(args) {
  const intersections = rectIntersection(args)
  if (intersections.length === 0) {
    return intersections
  }

  const intersectingIds = new Set(intersections.map((collision) => collision.id))
  const nearest = closestCenter(args).find((collision) =>
    intersectingIds.has(collision.id),
  )

  return nearest ? [nearest] : intersections
}

function GameScene({
  initialLineCount = 1,
  totalCarriages = 8,
  parcelsPerCarriage = 1,
  departureDurationMs = 1200,
  maxSelectableLines = 8,
}) {
  const queryTeamCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return (params.get('team') ?? '').toUpperCase()
  }, [])

  const [name, setName] = useState('')
  const [teamName, setTeamName] = useState('')
  const [joinCode, setJoinCode] = useState(queryTeamCode)
  const [session, setSession] = useState(null)
  const [team, setTeam] = useState(null)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [draggingParcel, setDraggingParcel] = useState(null)
  const pointerRef = useRef(null)
  const [roundComplete, setRoundComplete] = useState(false)
  // Parcel loading is entirely local: nothing is sent to the server until a
  // line is shipped. Keyed by `${lineId}:${cycleCount}` so a player's fresh
  // turn always starts empty. Shape: { [key]: { [carriageId]: parcelId[] } }.
  const [localLoads, setLocalLoads] = useState({})
  // Cosmetic slide-in flag per line, cleared once the arrival animation ends.
  const [arrivingLines, setArrivingLines] = useState({})
  // Lines sliding off to the right immediately after this player shipped them.
  const [departingLines, setDepartingLines] = useState({})
  // Lines this player has already shipped this round. Their rails stay empty
  // (rather than showing a "waiting" prompt) to signal the work is complete.
  const [shippedLines, setShippedLines] = useState({})
  // Tracks, per line, whether it was the local player's turn on the previous
  // render so we can detect the moment a train is handed to this player.
  const prevOwnedRef = useRef({})
  // Bumped on every local mutation so an in-flight background poll that started
  // before the mutation cannot overwrite the fresh state with a stale snapshot.
  const mutationRef = useRef(0)
  const totalParcels = totalCarriages * parcelsPerCarriage
  const [selectedLineCount, setSelectedLineCount] = useState(initialLineCount)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const selectableLineCount = Math.min(maxSelectableLines, totalCarriages)
  const defaultSelectedLineCount = Math.max(
    1,
    Math.min(initialLineCount, selectableLineCount),
  )

  useEffect(() => {
    setSelectedLineCount(defaultSelectedLineCount)
  }, [defaultSelectedLineCount])

  useEffect(() => {
    const storedSession = getStoredSession()
    if (storedSession?.teamCode && storedSession?.playerId) {
      setSession(storedSession)
    }
  }, [])

  useEffect(() => {
    if (!draggingParcel) {
      pointerRef.current = null
      return undefined
    }

    let animationFrameId

    function scrollAtEdge() {
      const pointer = pointerRef.current
      if (pointer) {
        const verticalDelta = getEdgeScrollDelta(pointer.y, window.innerHeight)
        if (verticalDelta !== 0) {
          window.scrollBy({ top: verticalDelta, behavior: 'auto' })
        }

        const scrollers = document.querySelectorAll('[data-line-scroll]')
        scrollers.forEach((scroller) => {
          if (scroller.scrollWidth <= scroller.clientWidth) {
            return
          }
          const rect = scroller.getBoundingClientRect()
          const overLine =
            pointer.y >= rect.top &&
            pointer.y <= rect.bottom &&
            pointer.x >= rect.left &&
            pointer.x <= rect.right
          if (!overLine) {
            return
          }
          const horizontalDelta = getHorizontalEdgeScrollDelta(
            pointer.x,
            rect.left,
            rect.right,
          )
          if (horizontalDelta !== 0) {
            scroller.scrollLeft += horizontalDelta
          }
        })
      }
      animationFrameId = window.requestAnimationFrame(scrollAtEdge)
    }

    function handlePointerMove(event) {
      pointerRef.current = { x: event.clientX, y: event.clientY }
    }

    window.addEventListener('pointermove', handlePointerMove)
    animationFrameId = window.requestAnimationFrame(scrollAtEdge)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.cancelAnimationFrame(animationFrameId)
      pointerRef.current = null
    }
  }, [draggingParcel])

  const carriageDistribution = useMemo(() => {
    return distributeCarriagesAcrossLines(totalCarriages, selectedLineCount)
  }, [totalCarriages, selectedLineCount])

  const playersById = useMemo(() => {
    const entries = team?.players ?? []
    return Object.fromEntries(entries.map((player) => [player.id, player]))
  }, [team])

  const myPlayerId = session?.playerId
  const isHost = session && team && team.hostPlayerId === session.playerId

  useEffect(() => {
    if (!session?.teamCode) {
      return undefined
    }

    let isAlive = true

    async function refreshTeam() {
      const seq = mutationRef.current
      try {
        const payload = await getTeam(session.teamCode)
        // Drop the response if a local mutation happened while it was in
        // flight, otherwise this stale snapshot would revert the change.
        if (isAlive && seq === mutationRef.current) {
          setTeam(payload.team)
        }
      } catch (requestError) {
        clearStoredSession()
        setSession(null)
        setTeam(null)
        if (isAlive) {
          setError(requestError.message)
        }
      }
    }

    refreshTeam()
    const intervalId = window.setInterval(refreshTeam, 2000)

    return () => {
      isAlive = false
      window.clearInterval(intervalId)
    }
  }, [session])

  // A fresh round wipes any local loading and arrival/departure animation
  // bookkeeping from the previous game.
  useEffect(() => {
    setLocalLoads({})
    setArrivingLines({})
    setDepartingLines({})
    setShippedLines({})
    prevOwnedRef.current = {}
  }, [team?.game?.startedAt])

  // Detect the moment a train becomes this player's responsibility (either at
  // the start of the round or when the previous player ships it our way) and
  // trigger its slide-in animation.
  useEffect(() => {
    if (team?.status !== 'active') {
      return undefined
    }

    const lines = team.game?.lines ?? []
    const nextOwned = { ...prevOwnedRef.current }

    lines.forEach((line) => {
      const owned = line.activePlayerId === myPlayerId && line.status === 'loading'
      const wasOwned = prevOwnedRef.current[line.id] ?? false
      if (owned && !wasOwned) {
        setArrivingLines((previous) => ({ ...previous, [line.id]: true }))
      }
      nextOwned[line.id] = owned
    })

    prevOwnedRef.current = nextOwned
    return undefined
  }, [team, myPlayerId])

  // Keep the yard mounted after the final shipment so the last train can slide
  // off screen before the completion screen replaces it.
  useEffect(() => {
    if (team?.status !== 'completed') {
      setRoundComplete(false)
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setRoundComplete(true)
    }, departureDurationMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [team?.status, departureDurationMs])

  // Merge each server line with this player's local (unsent) loading, plus the
  // per-line arrival/departure/ownership flags the yard needs to render.
  const lineViews = useMemo(() => {
    const lines = team?.game?.lines ?? []
    return lines.map((line) => {
      const key = `${line.id}:${line.cycleCount}`
      const loads = localLoads[key] ?? {}
      const carriages = line.carriages.map((carriage) => ({
        ...carriage,
        loadedParcelIds: loads[carriage.id] ?? [],
      }))
      const owned =
        line.activePlayerId === myPlayerId && line.status === 'loading'

      return {
        id: line.id,
        line: { ...line, carriages },
        owned,
        departing: Boolean(departingLines[line.id]),
        arriving: Boolean(arrivingLines[line.id]),
        shipped: Boolean(shippedLines[line.id]),
        ready: isLineReadyToShip({ carriages }),
      }
    })
  }, [team, localLoads, arrivingLines, departingLines, shippedLines, myPlayerId])

  // Parcels are a single shared pool for the current player's turn, not tied to
  // any line. Its size is the total remaining capacity of every line this
  // player currently controls, so any parcel can fill any carriage on any of
  // those lines. Loaded slots are shown as placeholders to keep the grid stable.
  const poolParcels = useMemo(() => {
    const controlled = lineViews.filter((view) => view.owned && !view.departing)

    let capacity = 0
    let loaded = 0
    for (const view of controlled) {
      for (const carriage of view.line.carriages) {
        capacity += carriage.requiredParcels
        loaded += carriage.loadedParcelIds.length
      }
    }

    const available = Math.max(0, capacity - loaded)
    const slots = []
    for (let index = 1; index <= available; index += 1) {
      slots.push({ parcelId: `parcel-${index}`, isAvailable: true, draggable: true })
    }
    for (let index = 1; index <= loaded; index += 1) {
      slots.push({ parcelId: `placeholder-${index}`, isAvailable: false, draggable: false })
    }
    return slots
  }, [lineViews])

  // Apply an authoritative team snapshot from a local mutation and invalidate
  // any background poll that is currently in flight.
  function commitTeam(nextTeam) {
    mutationRef.current += 1
    setTeam(nextTeam)
  }

  async function handleCreateTeam() {
    if (!name.trim()) {
      setError('Please enter your name.')
      return
    }
    if (!teamName.trim()) {
      setError('Please enter a team name.')
      return
    }
    setError('')
    setIsSubmitting(true)

    try {
      const payload = await createTeam({
        name,
        teamName,
        origin: window.location.origin,
      })

      setSession({
        playerId: payload.session.playerId,
        teamCode: payload.session.teamCode,
      })
      storeSession(payload.session)
      commitTeam(payload.team)
      setJoinCode(payload.team.code)
      window.history.replaceState({}, '', getTeamUrl(payload.team.code))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleJoinTeam() {
    if (!name.trim()) {
      setError('Please enter your name.')
      return
    }

    if (!joinCode.trim()) {
      setError('Please enter a team code.')
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      const payload = await joinTeam({
        name,
        teamCode: joinCode,
      })

      setSession({
        playerId: payload.session.playerId,
        teamCode: payload.session.teamCode,
      })
      storeSession(payload.session)
      commitTeam(payload.team)
      window.history.replaceState({}, '', getTeamUrl(payload.session.teamCode))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleStartGame() {
    if (!session || !team) {
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      const payload = await startGame({
        teamCode: team.code,
        playerId: session.playerId,
        lineCount: selectedLineCount,
        totalCarriages,
        parcelsPerCarriage,
      })
      commitTeam(payload.team)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handlePlayAgain() {
    if (!session || !team) {
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      const payload = await restartGame({
        teamCode: team.code,
        playerId: session.playerId,
      })
      commitTeam(payload.team)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleDragStart(event) {
    setDraggingParcel(event.active.data.current ?? null)
  }

  function handleDragCancel() {
    setDraggingParcel(null)
  }

  function handleDragEnd(event) {
    const parcel = event.active?.data?.current
    const target = event.over?.data?.current
    setDraggingParcel(null)

    if (parcel && target) {
      handleDropParcel(parcel, target.lineId, target.carriageId)
    }
  }

  // Loading a parcel is a purely local action: it only updates this player's
  // in-progress view and is never sent to the server. The server first hears
  // about the work when the line is shipped. Parcels are fungible members of a
  // shared pool, so any parcel can fill any carriage on a line this player
  // controls.
  function handleDropParcel(parcelPayload, targetLineId, carriageId) {
    if (!parcelPayload?.parcelId) {
      return
    }

    const line = (team?.game?.lines ?? []).find((entry) => entry.id === targetLineId)
    if (!line || line.status !== 'loading' || line.activePlayerId !== myPlayerId) {
      return
    }

    if (departingLines[targetLineId]) {
      return
    }

    const carriage = line.carriages.find((entry) => entry.id === carriageId)
    if (!carriage) {
      return
    }

    const key = `${line.id}:${line.cycleCount}`
    setLocalLoads((previous) => {
      const lineLoads = previous[key] ?? {}
      const current = lineLoads[carriageId] ?? []
      if (current.length >= carriage.requiredParcels) {
        return previous
      }

      // The stored id only needs to be unique within the carriage (for React
      // keys and the loaded count); which pool parcel was dragged is irrelevant.
      const loadedId = `${carriageId}-slot-${current.length + 1}`
      return {
        ...previous,
        [key]: { ...lineLoads, [carriageId]: [...current, loadedId] },
      }
    })
  }

  function handleArrivalEnd(lineId) {
    setArrivingLines((previous) => {
      if (!previous[lineId]) {
        return previous
      }
      const next = { ...previous }
      delete next[lineId]
      return next
    })
  }

  async function handleShipLine(lineId) {
    if (!session || !team) {
      return
    }

    const line = (team.game?.lines ?? []).find((entry) => entry.id === lineId)
    const key = line ? `${line.id}:${line.cycleCount}` : null

    // Slide the train off to the right on this player's screen straight away;
    // the server response then hands it to the next player (or completes).
    setDepartingLines((previous) => ({ ...previous, [lineId]: true }))
    setShippedLines((previous) => ({ ...previous, [lineId]: true }))

    try {
      const payload = await playLine({
        teamCode: team.code,
        playerId: session.playerId,
        lineId,
      })

      if (key) {
        setLocalLoads((previous) => {
          if (!(key in previous)) {
            return previous
          }
          const next = { ...previous }
          delete next[key]
          return next
        })
      }

      commitTeam(payload.team)

      window.setTimeout(() => {
        setDepartingLines((previous) => {
          const next = { ...previous }
          delete next[lineId]
          return next
        })
      }, departureDurationMs)
    } catch (requestError) {
      setDepartingLines((previous) => {
        const next = { ...previous }
        delete next[lineId]
        return next
      })
      setShippedLines((previous) => {
        const next = { ...previous }
        delete next[lineId]
        return next
      })
      setError(requestError.message)
    }
  }

  if (!session || !team) {
    return (
      <main className="game-screen">
        <header className="game-header">
          <h1>Delivery Rails</h1>
          <p>
            Split work into parallel train carriages to ship customer value earlier.
          </p>
        </header>

        <section className="setup-panel" aria-label="Join setup">
          <h2>Team Setup</h2>

          <label htmlFor="player-name-input">
            Your name <span className="required-mark" aria-hidden="true">*</span>
          </label>
          <input
            id="player-name-input"
            className="setup-input"
            data-testid="player-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter your name"
            required
            aria-required="true"
          />

          <div className="setup-options">
            <div className="setup-option" data-testid="create-option">
              <h3>Create a team</h3>
              <label htmlFor="team-name-input">
                Team name <span className="required-mark" aria-hidden="true">*</span>
              </label>
              <input
                id="team-name-input"
                className="setup-input"
                data-testid="team-name"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="e.g. Platform Crew"
                required
                aria-required="true"
              />
              <button
                type="button"
                className="setup-button"
                data-testid="create-team"
                disabled={isSubmitting}
                onClick={handleCreateTeam}
              >
                Create Team
              </button>
            </div>

            <div className="setup-option" data-testid="join-option">
              <h3>Join a team</h3>
              <label htmlFor="team-code-input">Team code</label>
              <input
                id="team-code-input"
                className="setup-input"
                data-testid="team-code-input"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="8 character team code"
              />
              <button
                type="button"
                className="setup-button"
                data-testid="join-team"
                disabled={isSubmitting}
                onClick={handleJoinTeam}
              >
                Join Team
              </button>
            </div>
          </div>

          {error ? <p className="error-message">{error}</p> : null}
        </section>
      </main>
    )
  }

  if (team.status === 'lobby') {
    const shareLink = getTeamUrl(team.code)

    return (
      <main className="game-screen">
        <header className="game-header">
          <h1>Team Lobby</h1>
          {team.name ? (
            <p data-testid="team-name-value">
              Team: <strong>{team.name}</strong>
            </p>
          ) : null}
          <p>
            Team code: <strong data-testid="team-code-value">{team.code}</strong>
          </p>
          <p data-testid="share-link">Share link: {shareLink}</p>
        </header>

        <section className="setup-panel" aria-label="Lobby">
          <h2>Players</h2>
          <ol className="setup-distribution" data-testid="lobby-players">
            {team.players.map((player) => (
              <li key={player.id}>
                {player.name}
                {player.id === team.hostPlayerId ? ' (host)' : ''}
              </li>
            ))}
          </ol>

          {team.games.length > 0 ? (
            <div data-testid="game-history">
              <h2>Previous Games</h2>
              <ol className="setup-distribution">
                {team.games.map((pastGame) => (
                  <li key={`game-${pastGame.gameNumber}`}>
                    Game {pastGame.gameNumber}: {pastGame.parcelsShipped} parcels shipped
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {isHost ? (
            <>
              <h2>Round Setup</h2>
              <p data-testid="setup-total-parcels">
                This round has {totalParcels} parcels to deliver.
              </p>
              <label htmlFor="line-count-select">Train lines</label>
              <select
                id="line-count-select"
                data-testid="line-count-select"
                value={selectedLineCount}
                onChange={(event) => setSelectedLineCount(Number(event.target.value))}
              >
                {Array.from({ length: selectableLineCount }, (_, index) => index + 1).map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </select>

              <p className="setup-caption">
                Carriages are split evenly. Any remainder is assigned from the top line
                down.
              </p>
              <ol className="setup-distribution" data-testid="carriage-distribution">
                {carriageDistribution.map((count, index) => (
                  <li key={`distribution-line-${index + 1}`}>
                    Line {index + 1}: {count} carriages
                  </li>
                ))}
              </ol>

              <button
                type="button"
                className="start-button"
                data-testid="start-round"
                disabled={isSubmitting}
                onClick={handleStartGame}
              >
                Start Loading
              </button>
            </>
          ) : (
            <p className="setup-caption" data-testid="waiting-host">
              Waiting for host to set lines and start the round.
            </p>
          )}

          {error ? <p className="error-message">{error}</p> : null}
        </section>
      </main>
    )
  }

  if (team.status === 'completed' && roundComplete) {
    const scoreEvents = team.game?.scoreEvents ?? []
    const gameNumber = team.game?.gameNumber ?? team.gameCount

    return (
      <main className="game-screen">
        <header className="game-header">
          <h1>Delivery Rails Complete</h1>
          <p>
            You are {playersById[session.playerId]?.name}. Team code: {team.code}
          </p>
        </header>
        <section className="setup-panel" data-testid="game-complete" aria-label="Game complete">
          <h2>Game {gameNumber} Complete</h2>
          <p>All trains have shipped for every team member.</p>
          <button
            type="button"
            className="start-button"
            data-testid="play-again"
            disabled={isSubmitting}
            onClick={handlePlayAgain}
          >
            Start Again
          </button>
          {error ? <p className="error-message">{error}</p> : null}
        </section>
        <ScoreBoard scoreEvents={scoreEvents} />
      </main>
    )
  }

  const scoreEvents = team.game?.scoreEvents ?? []

  return (
    <main className="game-screen">
      <header className="game-header">
        <h1>Delivery Rails Team Round</h1>
        <p>
          You are {playersById[session.playerId]?.name}. Team code: {team.code}
        </p>
      </header>
      <ScoreBoard scoreEvents={scoreEvents} />
      <DndContext
        sensors={sensors}
        collisionDetection={resolveCollisions}
        autoScroll={false}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <TrainYard
          lineViews={lineViews}
          onShipLine={handleShipLine}
          onArrivalEnd={handleArrivalEnd}
        />
        <Platform parcelSlots={poolParcels} />
        <DragOverlay dropAnimation={null}>
          {draggingParcel ? (
            <ParcelBox
              parcelId={draggingParcel.parcelId}
              className="parcel parcel-overlay"
              data-testid="drag-overlay"
              aria-hidden="true"
            />
          ) : null}
        </DragOverlay>
      </DndContext>
      {error ? <p className="error-message">{error}</p> : null}
    </main>
  )
}

export default GameScene
