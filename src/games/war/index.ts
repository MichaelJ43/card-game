import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { warLogic } from './logic'
import { warSelectAiAction } from './opponent'
import type { WarGameState } from './types'

export type { WarGameState } from './types'

const warModule: GameModule<WarGameState> = {
  moduleId: 'war',
  ...warLogic,
  selectAiAction: warSelectAiAction,
}

registerGameModule(warModule)
