import React from 'react'
import GameScene from './components/GameScene'
import './App.css'

function App() {
  return <GameScene initialLineCount={1} totalCarriages={8} parcelsPerCarriage={1} />
}

export default App
