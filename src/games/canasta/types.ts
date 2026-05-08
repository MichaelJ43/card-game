export interface CanastaGameState {
  phase: 'play' | 'done'
  currentPlayer: number
  drewThisTurn: boolean
  message: string
  roundScores: number[] | null
  reshuffleDiscardWhenDrawEmpty: boolean
}
