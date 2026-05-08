import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { highCardDuelLogic } from './logic'
import { highCardDuelSelectAiAction } from './opponent'
import type { HighCardGameState } from './types'

export type { HighCardGameState } from './types'

const highCardModule: GameModule<HighCardGameState> = {
  moduleId: 'high-card-duel',
  ...highCardDuelLogic,
  selectAiAction: highCardDuelSelectAiAction,
}

registerGameModule(highCardModule)
