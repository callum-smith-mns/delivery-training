import React from 'react'
import GameScene from './components/GameScene'
import LiveStatsPage from './components/LiveStatsPage'
import './App.css'

function App() {
  if (window.location.pathname === '/admin') {
    return <LiveStatsPage admin />
  }

  if (window.location.pathname === '/stats') {
    return <LiveStatsPage />
  }

  return <GameScene initialLineCount={1} totalCarriages={8} parcelsPerCarriage={1} />
}

export default App
