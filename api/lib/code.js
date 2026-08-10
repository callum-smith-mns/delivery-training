const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function generateTeamCode(length = 8, randomValue = Math.random) {
  let code = ''
  for (let index = 0; index < length; index += 1) {
    const charIndex = Math.floor(randomValue() * ALPHANUM.length)
    code += ALPHANUM[charIndex]
  }
  return code
}
