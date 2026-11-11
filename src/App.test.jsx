import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./components/GameScene', () => ({
  default: () => <div>Game page</div>,
}))

vi.mock('./components/LiveStatsPage', () => ({
  default: ({ admin }) => <div>{admin ? 'Admin page' : 'Stats page'}</div>,
}))

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
})

describe('App routing', () => {
  it.each([
    ['/admin', 'Admin page'],
    ['/delivery-rails/admin', 'Admin page'],
    ['/delivery-rails/admin/', 'Admin page'],
    ['/stats', 'Stats page'],
    ['/delivery-rails/stats', 'Stats page'],
    ['/delivery-rails/stats/', 'Stats page'],
    ['/', 'Game page'],
    ['/delivery-rails/', 'Game page'],
    ['/delivery-rails/administrator', 'Game page'],
  ])('renders %s as %s', (path, page) => {
    window.history.replaceState({}, '', path)
    render(<App />)
    expect(screen.getByText(page)).toBeInTheDocument()
  })
})
