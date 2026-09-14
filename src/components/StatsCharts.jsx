const FLOW_COLORS = ['#c8641e', '#2b7fb8', '#4f8a3a', '#a4231c', '#7a5cb0', '#0f7d84', '#b8892b']

function niceMax(value) {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const normalized = value / power
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * power
}

function formatSeconds(seconds) {
  const value = Math.round(seconds)
  if (value < 60) return `${value}s`
  return `${Math.floor(value / 60)}m ${String(value % 60).padStart(2, '0')}s`
}

function ChartFrame({ children, label }) {
  return (
    <div className="stats-chart-wrap">
      <svg className="stats-chart" viewBox="0 0 720 320" role="img" aria-label={label}>
        {children}
      </svg>
    </div>
  )
}

function Grid({ maxX = 0, maxY, xFormat = (value) => Math.round(value), yFormat = (value) => Math.round(value) }) {
  const left = 58
  const top = 18
  const plotWidth = 640
  const plotHeight = 240
  const xTo = (value) => left + (value / maxX) * plotWidth
  const yTo = (value) => top + plotHeight - (value / maxY) * plotHeight
  return (
    <>
      {Array.from({ length: 5 }, (_, index) => {
        const yValue = (maxY / 4) * index
        const xValue = (maxX / 4) * index
        const y = yTo(yValue)
        return (
          <g key={index}>
            <line x1={left} y1={y} x2={left + plotWidth} y2={y} stroke="#d8b57e" />
            <text x={left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#6a3310">{yFormat(yValue)}</text>
            <text x={xTo(xValue)} y={top + plotHeight + 18} textAnchor="middle" fontSize="11" fill="#6a3310">{xFormat(xValue)}</text>
          </g>
        )
      })}
      <line x1={left} y1={top} x2={left} y2={top + plotHeight} stroke="#5f3a12" strokeWidth="2" />
      <line x1={left} y1={top + plotHeight} x2={left + plotWidth} y2={top + plotHeight} stroke="#5f3a12" strokeWidth="2" />
    </>
  )
}

function BarChart({ values, label }) {
  const maxY = niceMax(Math.max(1, ...values.flatMap((value) => [value.mean + value.stddev, ...value.points])))
  const plotLeft = 58
  const plotWidth = 640
  const xStep = plotWidth / Math.max(values.length, 1)
  const yTo = (value) => 18 + 240 - (value / maxY) * 240
  return (
    <ChartFrame label={label}>
      <Grid maxX={values.length} maxY={maxY} xFormat={() => ''} yFormat={formatSeconds} />
      {values.map((value, index) => {
        const center = plotLeft + xStep * (index + 0.5)
        const top = yTo(value.mean)
        const errorTop = yTo(value.mean + value.stddev)
        const errorBottom = yTo(Math.max(0, value.mean - value.stddev))
        return (
          <g key={value.label}>
            <rect x={center - 24} y={top} width="48" height={258 - top} fill={value.color} opacity=".86" />
            {value.stddev > 0 ? <>
              <line x1={center} y1={errorTop} x2={center} y2={errorBottom} stroke="#3d2200" strokeWidth="2" />
              <line x1={center - 8} y1={errorTop} x2={center + 8} y2={errorTop} stroke="#3d2200" strokeWidth="2" />
              <line x1={center - 8} y1={errorBottom} x2={center + 8} y2={errorBottom} stroke="#3d2200" strokeWidth="2" />
            </> : null}
            {value.points.map((point, pointIndex) => <circle key={pointIndex} cx={center} cy={yTo(point)} r="4" fill="#fff5dc" stroke="#3d2200" strokeWidth="1.5" />)}
            <text x={center} y="276" textAnchor="end" fontSize="11" fill="#4b2b06" transform={`rotate(-30 ${center} 276)`}>{value.label}</text>
          </g>
        )
      })}
    </ChartFrame>
  )
}

function LineChart({ series, label, yLabel, showRuns = false, runs = [] }) {
  const points = series.flatMap((line) => line.points)
  const maxX = niceMax(Math.max(1, ...points.map((point) => point.seconds + (point.secondsStddev || 0))))
  const maxY = niceMax(Math.max(1, ...points.map((point) => point.cumulativeParcels)))
  const xTo = (value) => 58 + (value / maxX) * 640
  const yTo = (value) => 18 + 240 - (value / maxY) * 240
  const pathFor = (line) => line.points.map((point, index) => `${index === 0 ? 'M' : 'L'}${xTo(point.seconds)} ${yTo(point.cumulativeParcels)}`).join(' ')
  return (
    <>
      <div className="stats-legend">
        {series.map((line) => <span key={line.label}><i style={{ background: line.color }} />{line.label}</span>)}
        {showRuns ? <span><i style={{ background: '#c79a5c' }} />Individual runs</span> : null}
      </div>
      <ChartFrame label={label}>
        <Grid maxX={maxX} maxY={maxY} xFormat={formatSeconds} />
        {showRuns ? runs.map((run, index) => <path key={index} d={pathFor(run)} fill="none" stroke="#c79a5c" strokeWidth="1.5" opacity=".7" />) : null}
        {series.map((line) => <g key={line.label}>
          <path d={pathFor(line)} fill="none" stroke={line.color} strokeWidth={line.isFinal ? 3 : 2} />
          {line.points.map((point, index) => <g key={index}>
            {point.secondsStddev > 0 ? <line x1={xTo(Math.max(0, point.seconds - point.secondsStddev))} y1={yTo(point.cumulativeParcels)} x2={xTo(point.seconds + point.secondsStddev)} y2={yTo(point.cumulativeParcels)} stroke="#3d2200" /> : null}
            <circle cx={xTo(point.seconds)} cy={yTo(point.cumulativeParcels)} r={line.isFinal ? 4 : 3} fill={line.color} stroke="#fff5dc" strokeWidth="1.5" />
          </g>)}
        </g>)}
        <text x="378" y="312" textAnchor="middle" fontSize="12" fill="#4b2b06">Time since game start</text>
        <text x="14" y="138" textAnchor="middle" fontSize="12" fill="#4b2b06" transform="rotate(-90 14 138)">{yLabel}</text>
      </ChartFrame>
    </>
  )
}

export function StatsOverview({ team, color }) {
  const categories = team.groups.map((group) => ({
    label: `${group.lineCount} line${group.lineCount === 1 ? '' : 's'}`,
    color,
    first: { mean: group.firstMean, stddev: group.firstStddev, points: group.games.map((game) => game.firstDelivery) },
    completion: { mean: group.completionMean, stddev: group.completionStddev, points: group.games.map((game) => game.completion) },
  }))
  return <section className="stats-panel">
    <h2>Overview</h2>
    <p className="stats-caption">{team.name} ({team.code}) · average bars, individual runs as dots, and whiskers show one standard deviation.</p>
    <h3>Time to first delivery</h3>
    <BarChart values={categories.map((category) => ({ label: category.label, color: category.color, ...category.first }))} label="Average time to first delivery by line count" />
    <h3>Time to complete the whole delivery</h3>
    <BarChart values={categories.map((category) => ({ label: category.label, color: category.color, ...category.completion }))} label="Average completion time by line count" />
  </section>
}

export function StatsGroup({ group, color }) {
  const flowSeries = group.flow.map((member) => ({
    label: `Member ${member.position + 1}${member.playerName ? ` · ${member.playerName}` : ''}${member.isFinal ? ' → customer' : ''}`,
    color: member.isFinal ? color : FLOW_COLORS[member.position % FLOW_COLORS.length],
    isFinal: member.isFinal,
    points: [{ seconds: 0, cumulativeParcels: 0, secondsStddev: 0 }, ...member.points],
  }))
  const deliverySeries = [{
    label: 'Average delivery timeline',
    color,
    isFinal: true,
    points: [{ seconds: 0, cumulativeParcels: 0, secondsStddev: 0 }, ...group.timeline],
  }]
  const runs = group.games.map((game) => ({ points: [{ seconds: 0, cumulativeParcels: 0 }, ...game.timeline] }))
  return <div className="stats-group">
    <h3>{group.lineCount} line{group.lineCount === 1 ? '' : 's'} · {group.games.length} game{group.games.length === 1 ? '' : 's'}</h3>
    <table className="stats-table"><thead><tr><th>Run</th><th>First delivery</th><th>Delta vs avg</th><th>Full delivery</th><th>Delta vs avg</th><th>Members</th></tr></thead>
      <tbody>{group.games.map((game) => <tr key={game.gameNumber}><td>Game {game.gameNumber ?? '-'}</td><td>{formatSeconds(game.firstDelivery)}</td><td>{formatDelta(game.firstDelivery - group.firstMean)}</td><td>{formatSeconds(game.completion)}</td><td>{formatDelta(game.completion - group.completionMean)}</td><td>{game.playerCount}</td></tr>)}
        <tr className="summary-row"><td>Average</td><td>{formatSeconds(group.firstMean)}</td><td>-</td><td>{formatSeconds(group.completionMean)}</td><td>-</td><td>-</td></tr>
        <tr className="stddev-row"><td>Std deviation</td><td>{formatSeconds(group.firstStddev)}</td><td>-</td><td>{formatSeconds(group.completionStddev)}</td><td>-</td><td>-</td></tr>
      </tbody>
    </table>
    <p className="chart-title">Parcel flow through the relay (member → member → customer)</p>
    <LineChart series={flowSeries} label="Parcel flow through relay members" yLabel="Parcels handed on" />
    <p className="chart-title">Deliveries to the customer (parcels leaving the final member)</p>
    <LineChart series={deliverySeries} runs={runs} showRuns label="Customer delivery timeline" yLabel="Parcels delivered" />
  </div>
}

function formatDelta(seconds) {
  const value = Math.round(seconds)
  return value === 0 ? '0s' : `${value > 0 ? '+' : '-'}${formatSeconds(Math.abs(value))}`
}