import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { pinochleLogic } from './logic'
import { pinochleSelectAiAction } from './opponent'
import type { PinochleGameState } from './types'

const pinochleModule: GameModule<PinochleGameState> = {
  moduleId: 'pinochle',
  ...pinochleLogic,
  selectAiAction: pinochleSelectAiAction,
}

registerGameModule(pinochleModule)

export type { PinochleGameState } from './types'
