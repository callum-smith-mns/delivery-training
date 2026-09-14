import React from 'react'
import { render, screen } from '@testing-library/react'
import GameScene, {
  getEdgeScrollDelta,
  getHorizontalEdgeScrollDelta,
  getTeamUrl,
} from './GameScene'

describe('GameScene', () => {
  it('shows create and join controls on first screen', () => {
    render(<GameScene />)

    expect(screen.getByTestId('player-name')).toBeInTheDocument()
    expect(screen.getByTestId('create-team')).toBeInTheDocument()
    expect(screen.getByTestId('team-code-input')).toBeInTheDocument()
    expect(screen.getByTestId('join-team')).toBeInTheDocument()
  })

  it('prefills team code from query string', () => {
    window.history.replaceState({}, '', '/?team=ABCD1234')
    render(<GameScene />)

    expect(screen.getByTestId('team-code-input')).toHaveValue('ABCD1234')
  })

  it('calculates page scrolling only near the vertical edges', () => {
    expect(getEdgeScrollDelta(400, 800)).toBe(0)
    expect(getEdgeScrollDelta(20, 800)).toBe(-18)
    expect(getEdgeScrollDelta(780, 800)).toBe(18)
    expect(getEdgeScrollDelta(721, 800)).toBe(1)
  })

  it('scrolls a line horizontally only near its left/right edges', () => {
    expect(getHorizontalEdgeScrollDelta(200, 100, 400)).toBe(0)
    expect(getHorizontalEdgeScrollDelta(110, 100, 400)).toBe(-18)
    expect(getHorizontalEdgeScrollDelta(395, 100, 400)).toBe(18)
    expect(getHorizontalEdgeScrollDelta(321, 100, 400)).toBe(1)
  })

  it('preserves the current URL when adding a team code', () => {
    window.history.replaceState({}, '', '/delivery/?invite=yes')

    expect(getTeamUrl('ABCD1234')).toBe(
      'http://localhost:3000/delivery/?invite=yes&team=ABCD1234',
    )
  })
})
