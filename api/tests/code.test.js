import { generateTeamCode } from '../lib/code.js'

describe('generateTeamCode', () => {
  it('creates an 8-character alphanumeric code', () => {
    const code = generateTeamCode(8, () => 0)
    expect(code).toHaveLength(8)
    expect(code).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('uses provided randomness across alphanumeric range', () => {
    const values = [0, 0.5, 0.999, 0.1, 0.2, 0.3, 0.4, 0.6]
    let index = 0
    const code = generateTeamCode(8, () => values[index++])
    expect(code).toMatch(/^[A-Z0-9]{8}$/)
    expect(new Set(code.split('')).size).toBeGreaterThan(3)
  })
})
