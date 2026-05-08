import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { goFishLogic } from './logic'
import { goFishSelectAiAction } from './opponent'
import type { GoFishGameState } from './types'

const goFishModule: GameModule<GoFishGameState> = {
  moduleId: 'go-fish',
  ...goFishLogic,
  selectAiAction: goFishSelectAiAction,
}

registerGameModule(goFishModule)

export type { GoFishGameState } from './types'
