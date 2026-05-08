export interface PokerDrawGameState {
  phase: 'bet' | 'draw' | 'done'
  stacks: [number, number]
  ante: number
  roundDelta: [number, number] | null
  message: string
  reshuffleDiscardWhenDrawEmpty: boolean
}
