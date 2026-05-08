export interface DurakGameState {
  phase: 'play' | 'done'
  /** Seat that must act (mirrors attacker on attack, defender on defend). */
  currentPlayer: number
  attacker: number
  defender: number
  sub: 'attack' | 'defend'
  trumpSuit: string
  message: string
  roundScores: number[] | null
}
