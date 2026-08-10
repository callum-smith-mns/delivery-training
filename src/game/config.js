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

export function createInitialGameState({
  lineCount = 1,
  totalCarriages = 8,
  parcelsPerCarriage = 1,
} = {}) {
  const trainLines = []
  const platformParcels = []
  const carriagesPerLine = distributeCarriagesAcrossLines(totalCarriages, lineCount)

  for (let lineIndex = 0; lineIndex < carriagesPerLine.length; lineIndex += 1) {
    const lineId = `line-${lineIndex + 1}`
    const carriages = []
    const carriageCountForLine = carriagesPerLine[lineIndex]

    for (
      let carriageIndex = 0;
      carriageIndex < carriageCountForLine;
      carriageIndex += 1
    ) {
      const carriageId = `${lineId}-carriage-${carriageIndex + 1}`
      const requiredParcels = parcelsPerCarriage
      carriages.push({
        id: carriageId,
        requiredParcels,
        loadedParcelIds: [],
      })

      for (
        let parcelIndex = 0;
        parcelIndex < requiredParcels;
        parcelIndex += 1
      ) {
        const parcelId = `${lineId}-parcel-${carriageIndex + 1}-${parcelIndex + 1}`
        platformParcels.push({ id: parcelId })
      }
    }

    trainLines.push({
      id: lineId,
      status: 'loading',
      carriages,
    })
  }

  return { trainLines, platformParcels }
}

export function getLineCapacity(line) {
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
