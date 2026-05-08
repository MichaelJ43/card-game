import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { blackjackLogic } from './logic'
import { blackjackSelectAiAction } from './opponent'
import type { BlackjackGameState } from './types'

export type { BlackjackGameState } from './types'

const blackjackModule: GameModule<BlackjackGameState> = {
  moduleId: 'blackjack',
  ...blackjackLogic,
  selectAiAction: blackjackSelectAiAction,
}

registerGameModule(blackjackModule)
