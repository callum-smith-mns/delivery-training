import React from 'react'
import Parcel from './Parcel'

function Platform({ parcelSlots }) {
  return (
    <section className="platform" aria-label="Parcel platform">
      <div className="platform-header">
        <h2>Platform Cargo Queue</h2>
        <p>Drag any parcel onto any carriage on the rails you control.</p>
      </div>
      <div className="parcel-grid" data-testid="parcel-platform">
        {parcelSlots.map((slot) => {
          const parcelClass = slot.isAvailable
            ? 'parcel-slot'
            : 'parcel-slot parcel-slot-empty'

          return (
            <div
              className={parcelClass}
              data-testid={`parcel-slot-${slot.parcelId}`}
              key={slot.parcelId}
            >
              {slot.isAvailable ? (
                <Parcel parcelId={slot.parcelId} draggable={slot.draggable} />
              ) : (
                <div className="parcel parcel-placeholder" aria-hidden="true"></div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default Platform
