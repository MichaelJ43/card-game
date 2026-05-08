import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { thirtyOneLogic } from './logic'
import { thirtyOneSelectAiAction } from './opponent'
import type { ThirtyOneGameState } from './types'

const thirtyOneModule: GameModule<ThirtyOneGameState> = {
  moduleId: 'thirty-one',
  ...thirtyOneLogic,
  selectAiAction: thirtyOneSelectAiAction,
}

registerGameModule(thirtyOneModule)

export type { ThirtyOneGameState } from './types'
