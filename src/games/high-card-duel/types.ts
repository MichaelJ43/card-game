export interface HighCardGameState {
  phase: 'bet' | 'done'
  stacks: [number, number]
  bet: number
  roundDelta: [number, number] | null
  message: string
}
