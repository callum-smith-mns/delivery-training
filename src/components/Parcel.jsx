import React, { forwardRef } from 'react'
import { useDraggable } from '@dnd-kit/core'

export const ParcelBox = forwardRef(function ParcelBox(
  { parcelId, className, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={className} {...rest}>
      <span className="parcel-knot" aria-hidden="true"></span>
      <span className="parcel-label" aria-hidden="true">
        {parcelId.split('-').slice(-2).join('.')}
      </span>
      {children}
    </div>
  )
})

function Parcel({ parcelId, draggable }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: parcelId,
    disabled: !draggable,
    data: { parcelId },
  })

  const classNames = ['parcel']
  if (!draggable) {
    classNames.push('parcel-disabled')
  }
  if (isDragging) {
    classNames.push('parcel-dragging')
  }

  return (
    <ParcelBox
      ref={setNodeRef}
      parcelId={parcelId}
      className={classNames.join(' ')}
      aria-label={`Parcel ${parcelId}`}
      {...listeners}
      {...attributes}
      data-testid={`parcel-${parcelId}`}
      data-parcel-id={parcelId}
    />
  )
}

export default Parcel

