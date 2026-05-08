export interface PinochleGameState {
  phase: 'play' | 'done'
  currentPlayer: number
  trumpSuit: string
  trick: { player: number; templateId: string }[]
  tricksWon: number[]
  tricksPlayed: number
  message: string
  roundScores: number[] | null
}
