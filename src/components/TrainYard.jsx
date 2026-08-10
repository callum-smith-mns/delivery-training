import React from 'react'
import TrainLine from './TrainLine'

function TrainYard({ lineViews, onShipLine, onArrivalEnd }) {
  return (
    <section className="train-yard" aria-label="Train yard">
      {lineViews.map((view) => (
        <TrainLine
          key={view.id}
          view={view}
          onShipLine={onShipLine}
          onArrivalEnd={onArrivalEnd}
        />
      ))}
    </section>
  )
}

export default TrainYard
