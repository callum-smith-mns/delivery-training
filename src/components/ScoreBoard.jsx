import React from 'react'

function ScoreBoard({ scoreEvents }) {
  const totalShipped = scoreEvents.reduce(
    (sum, event) => sum + event.parcelsShipped,
    0,
  )

  return (
    <aside className="score-board" aria-label="Shipping score">
      <h2>Delivery Score</h2>
      <p className="score-total" data-testid="total-shipped">
        {totalShipped} parcels shipped
      </p>
      <ol className="score-log" data-testid="score-log">
        {scoreEvents.map((event) => (
          <li key={event.id}>
            {event.playerName} shipped {event.parcelsShipped} on {event.lineId} at{' '}
            {new Date(event.playedAt).toLocaleTimeString()} (+
            {event.elapsedSeconds}s)
          </li>
        ))}
      </ol>
    </aside>
  )
}

export default ScoreBoard
