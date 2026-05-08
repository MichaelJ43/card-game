export interface BaccaratGameState {
  phase: 'bet' | 'done'
  stacks: [number, number]
  bet: number
  side: 'player' | 'banker' | null
  roundDelta: [number, number] | null
  message: string
}
