import React from 'react'
import { render, screen } from '@testing-library/react'
import GameScene from './GameScene'

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
})
