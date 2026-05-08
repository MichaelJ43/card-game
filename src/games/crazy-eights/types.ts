export interface Crazy8sGameState {
  phase: 'play' | 'roundOver'
  currentPlayer: number
  currentSuit: string
  message: string
  roundScores: number[] | null
  reshuffleDiscardWhenDrawEmpty: boolean
}
