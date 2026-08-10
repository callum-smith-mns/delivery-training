import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_DB = { teams: {} }

export class FileStorage {
  constructor(filePath) {
    this.filePath = filePath
  }

  async ensure() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    try {
      await fs.access(this.filePath)
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify(DEFAULT_DB, null, 2), 'utf8')
    }
  }

  async readData() {
    await this.ensure()
    const raw = await fs.readFile(this.filePath, 'utf8')
    return JSON.parse(raw)
  }

  async writeData(data) {
    await this.ensure()
    const tmpPath = `${this.filePath}.tmp`
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8')
    await fs.rename(tmpPath, this.filePath)
  }
}
