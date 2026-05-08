import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { pokerDrawLogic } from './logic'
import { pokerDrawSelectAiAction } from './opponent'
import type { PokerDrawGameState } from './types'

export type { PokerDrawGameState } from './types'

const pokerDrawModule: GameModule<PokerDrawGameState> = {
  moduleId: 'poker-draw',
  ...pokerDrawLogic,
  selectAiAction: pokerDrawSelectAiAction,
}

registerGameModule(pokerDrawModule)
