import type { AiDifficulty } from './aiContext'

export function aiIsExpert(d: AiDifficulty): boolean {
  return d === 'expert'
}

export function aiIsHardOrExpert(d: AiDifficulty): boolean {
  return d === 'hard' || d === 'expert'
}
