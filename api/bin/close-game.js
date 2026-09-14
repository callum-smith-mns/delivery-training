#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FileStorage } from '../lib/storage.js'
import { TeamService } from '../service/teamService.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const defaultDbPath = path.resolve(currentDir, '..', 'data', 'teams.json')
const args = process.argv.slice(2)
const teamCode = args.find((arg) => !arg.startsWith('--'))
const dbFlagIndex = args.indexOf('--db')
const dbPath = dbFlagIndex >= 0 ? args[dbFlagIndex + 1] : process.env.DB_PATH ?? defaultDbPath

if (!teamCode || !dbPath) {
  console.error('Usage: npm run close-game -- <team-code> [--db <path>]')
  process.exitCode = 1
} else {
  const service = new TeamService({ storage: new FileStorage(dbPath) })

  try {
    const team = await service.closeOpenGame({ teamCode })
    console.log(`Closed open game for ${team.code}; team returned to lobby.`)
  } catch (error) {
    console.error(`Unable to close game: ${error.message}`)
    process.exitCode = 1
  }
}