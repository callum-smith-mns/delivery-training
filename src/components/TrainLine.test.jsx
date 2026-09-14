// eslint-disable-next-line no-unused-vars
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TrainLine from './TrainLine'

function createView(overrides = {}) {
  return {
    id: 'line-1',
    owned: true,
    departing: false,
    arriving: false,
    shipped: false,
    ready: true,
    line: {
      id: 'line-1',
      carriages: [
        {
          id: 'line-1-carriage-1',
          requiredParcels: 3,
          loadedParcelIds: ['parcel-1', 'parcel-2', 'parcel-3'],
        },
      ],
    },
    ...overrides,
  }
}

describe('TrainLine', () => {
  it('keeps the previous parcel count visible while the train departs', () => {
    const onShipLine = vi.fn()
    const { rerender } = render(
      <TrainLine
        view={createView()}
        onShipLine={onShipLine}
        onArrivalEnd={vi.fn()}
      />,
    )

    expect(screen.getByText('0 parcels needed')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('ship-line-1'))

    rerender(
      <TrainLine
        view={createView({
          owned: false,
          departing: true,
          ready: false,
          line: {
            id: 'line-1',
            carriages: [
              {
                id: 'line-1-carriage-1',
                requiredParcels: 3,
                loadedParcelIds: [],
              },
            ],
          },
        })}
        onShipLine={onShipLine}
        onArrivalEnd={vi.fn()}
      />,
    )

    expect(onShipLine).toHaveBeenCalledWith('line-1')
    expect(screen.getByText('0 parcels needed')).toBeInTheDocument()
    expect(screen.queryByText('3 parcels needed')).not.toBeInTheDocument()
  })
})