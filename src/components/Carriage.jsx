// eslint-disable-next-line no-unused-vars
import React from 'react'
import { useDroppable } from '@dnd-kit/core'

function Carriage({
  lineId,
  carriage,
  acceptsDrop,
  loadedParcels,
  canInteract,
  departing,
  departureRemaining,
}) {
  const loadedCount = loadedParcels.length
  const remaining = carriage.requiredParcels - loadedCount
  const displayedRemaining = departing ? departureRemaining ?? remaining : remaining

  const { isOver, setNodeRef } = useDroppable({
    id: carriage.id,
    disabled: !acceptsDrop,
    data: { lineId, carriageId: carriage.id },
  })

  const classNames = ['carriage', acceptsDrop ? 'can-drop' : 'full']
  if (isOver && acceptsDrop) {
    classNames.push('drop-target')
  }

  return (
    <article
      ref={setNodeRef}
      className={classNames.join(' ')}
      data-testid={`carriage-${carriage.id}`}
      data-line-id={lineId}
      data-carriage-id={carriage.id}
      aria-label={`Carriage ${carriage.id}`}
    >
      <div className="carriage-art" aria-hidden="true">
        <span className="wheel"></span>
        <span className="wheel"></span>
      </div>
      <div className="carriage-progress" data-testid={`progress-${carriage.id}`}>
        {loadedCount}/{carriage.requiredParcels}
      </div>
      <p className="carriage-remaining">
        {displayedRemaining} parcels needed
      </p>
      {!canInteract && !departing ? (
        <p className="carriage-note">Waiting for active player</p>
      ) : null}
      <div className="carriage-cargo" aria-hidden="true">
        {loadedParcels.map((parcelId) => (
          <span className="cargo-block" key={parcelId}></span>
        ))}
      </div>
    </article>
  )
}

export default Carriage
