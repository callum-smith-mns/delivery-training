import React from 'react'
import Carriage from './Carriage'
import Locomotive from './Locomotive'

function TrainLine({ view, onShipLine, onArrivalEnd }) {
  const { id, line, owned, departing, arriving, shipped, ready } = view

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

  return (
    <section className="train-line" aria-label={`Train line ${id}`}>
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
            />
          )
        })}
        <Locomotive
          canShip={ready && canInteract}
          onShip={() => onShipLine(id)}
          lineId={id}
          isCurrentPlayer={canInteract}
        />
      </div>
      <div className="track" aria-hidden="true"></div>
    </section>
  )
}

export default TrainLine
