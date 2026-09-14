// eslint-disable-next-line no-unused-vars
import React, { useState } from 'react'
import Carriage from './Carriage'
import Locomotive from './Locomotive'

function TrainLine({ view, onShipLine, onArrivalEnd }) {
  const { id, line, owned, departing, arriving, shipped, ready } = view
  const [departureRemaining, setDepartureRemaining] = useState(null)

  // Until the previous player ships this train our way the rails stay empty.
  if (!owned && !departing) {
    // Once this player has shipped the line, leave the rails empty to signal
    // their part is complete rather than prompting them to keep waiting.
    if (shipped) {
      return (
        <section className="train-line" aria-label={`Train line ${id}`}>
          <div className="rail-empty" data-testid={`shipped-${id}`} aria-hidden="true"></div>
          <div className="track" aria-hidden="true"></div>
        </section>
      )
    }

    return (
      <section className="train-line" aria-label={`Train line ${id}`}>
        <div className="rail-waiting" data-testid={`waiting-${id}`}>
          waiting previous player
        </div>
        <div className="track" aria-hidden="true"></div>
      </section>
    )
  }

  const consistClass = [
    'train-consist',
    departing ? 'departed' : '',
    arriving && !departing ? 'arriving' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const canInteract = owned && !departing
  // Each settled, owned line scrolls its carriages horizontally on its own so a
  // train longer than the screen stays fully reachable. Off during the
  // arrival/departure slide so those transforms play across the full viewport.
  const scrollable = canInteract && !arriving

  function handleShip() {
    setDepartureRemaining(
      Object.fromEntries(
        line.carriages.map((carriage) => [
          carriage.id,
          carriage.requiredParcels - carriage.loadedParcelIds.length,
        ]),
      ),
    )
    onShipLine(id)
  }

  return (
    <section className="train-line" aria-label={`Train line ${id}`}>
      <div
        className={`train-scroll${scrollable ? ' is-scrollable' : ''}`}
        data-testid={`line-scroll-${id}`}
        {...(scrollable ? { 'data-line-scroll': '' } : {})}
      >
        <div
          className={consistClass}
          data-testid={`train-${id}`}
          onAnimationEnd={() => {
            if (arriving) {
              onArrivalEnd(id)
            }
          }}
        >
          {line.carriages.map((carriage) => {
            const acceptsDrop =
              canInteract &&
              carriage.loadedParcelIds.length < carriage.requiredParcels

            return (
              <Carriage
                key={carriage.id}
                lineId={id}
                carriage={carriage}
                loadedParcels={carriage.loadedParcelIds}
                acceptsDrop={acceptsDrop}
                canInteract={canInteract}
                departing={departing}
                departureRemaining={departureRemaining?.[carriage.id]}
              />
            )
          })}
          <Locomotive
            canShip={ready && canInteract}
            onShip={handleShip}
            lineId={id}
            isCurrentPlayer={canInteract}
          />
        </div>
      </div>
      <div className="track" aria-hidden="true"></div>
    </section>
  )
}

export default TrainLine
