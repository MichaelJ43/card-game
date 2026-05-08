export interface ThirtyOneGameState {
  phase: 'play' | 'done'
  currentPlayer: number
  message: string
  roundScores: number[] | null
  reshuffleDiscardWhenDrawEmpty: boolean
}
