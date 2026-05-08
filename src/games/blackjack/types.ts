export interface BlackjackGameState {
  phase: 'bet' | 'play' | 'doneRound'
  stacks: [number, number]
  bet: number
  roundDelta: [number, number] | null
  message: string
  /** House rule: dealer draws again on soft 17. */
  dealerHitsSoft17: boolean
}
