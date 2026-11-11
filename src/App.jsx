import React from 'react'
import GameScene from './components/GameScene'
import LiveStatsPage from './components/LiveStatsPage'
import './App.css'

function App() {
  const page = window.location.pathname.replace(/\/+$/, '').split('/').pop()

  if (page === 'admin') {
    return <LiveStatsPage admin />
  }

  if (page === 'stats') {
    return <LiveStatsPage />
  }

  return <GameScene initialLineCount={1} totalCarriages={8} parcelsPerCarriage={1} />
}

export default App
