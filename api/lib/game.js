export function distributeCarriagesAcrossLines(totalCarriages, requestedLineCount) {
  const safeCarriageTotal = Math.max(1, totalCarriages)
  const safeLineCount = Math.max(
    1,
    Math.min(requestedLineCount, safeCarriageTotal),
  )
  const baseCarriagesPerLine = Math.floor(safeCarriageTotal / safeLineCount)
  const extraCarriages = safeCarriageTotal % safeLineCount

  return Array.from({ length: safeLineCount }, (_, index) => {
    return baseCarriagesPerLine + (index < extraCarriages ? 1 : 0)
  })
}

export function createCarriages(lineId, carriageCount, parcelsPerCarriage) {
  return Array.from({ length: carriageCount }, (_, index) => ({
    id: `${lineId}-carriage-${index + 1}`,
    requiredParcels: parcelsPerCarriage,
    loadedParcelIds: [],
  }))
}

export function lineCapacity(line) {
  return line.carriages.reduce(
    (total, carriage) => total + carriage.requiredParcels,
    0,
  )
}

export function isLineReadyToShip(line) {
  return line.carriages.every(
    (carriage) => carriage.loadedParcelIds.length >= carriage.requiredParcels,
  )
}

export function createParcelIdsForLine(lineId, count, nextParcelSequence) {
  const parcelIds = []
  let sequence = nextParcelSequence

  for (let index = 0; index < count; index += 1) {
    parcelIds.push(`${lineId}-parcel-${sequence}`)
    sequence += 1
  }

  return { parcelIds, nextParcelSequence: sequence }
}

export function shufflePlayerOrder(playerIds, randomValue = Math.random) {
  const order = [...playerIds]
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomValue() * (index + 1))
    ;[order[index], order[swapIndex]] = [order[swapIndex], order[index]]
  }
  return order
}
