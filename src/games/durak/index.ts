import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { durakLogic } from './logic'
import { durakSelectAiAction } from './opponent'
import type { DurakGameState } from './types'

const durakModule: GameModule<DurakGameState> = {
  moduleId: 'durak',
  ...durakLogic,
  selectAiAction: durakSelectAiAction,
}

registerGameModule(durakModule)

export type { DurakGameState } from './types'
