import React, { useRef } from 'react'

function Locomotive({ canShip, onShip, lineId, isCurrentPlayer }) {
  // @dnd-kit suppresses the `click` event for 50ms after a drag ends (it adds a
  // capture-phase document click listener that stops propagation). If the user
  // clicks "Play" immediately after dropping the final parcel, that click is
  // swallowed and nothing happens. `pointerup` is not suppressed, so we ship on
  // pointer release as well as click, deduping so a single interaction only
  // ships once. Keeping onClick preserves keyboard (Enter/Space) activation.
  const lastShipAtRef = useRef(0)

  const triggerShip = () => {
    const now = Date.now()
    if (now - lastShipAtRef.current < 400) {
      return
    }
    lastShipAtRef.current = now
    onShip()
  }

  return (
    <div className="locomotive-wrapper">
      <div className="locomotive" aria-label={`Locomotive ${lineId}`}>
        <span className="chimney" aria-hidden="true"></span>
        <span className="wheel"></span>
        <span className="wheel"></span>
        {canShip ? (
          <button
            type="button"
            className="ship-button"
            onClick={triggerShip}
            onPointerUp={(event) => {
              if (event.button === 0) {
                triggerShip()
              }
            }}
            data-testid={`ship-${lineId}`}
            disabled={!isCurrentPlayer}
          >
            Play
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default Locomotive
