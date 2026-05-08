export interface SequenceRaceGameState {
  phase: 'play' | 'done'
  currentPlayer: number
  piles: [number, number, number, number]
  message: string
  roundScores: number[] | null
}
