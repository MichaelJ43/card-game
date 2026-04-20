import { randomInt } from 'node:crypto'

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const LENGTH = 6

export function generateRoomCode(): string {
  let out = ''
  for (let i = 0; i < LENGTH; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return out
}

export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && value.length === LENGTH && [...value].every((c) => ALPHABET.includes(c))
}
