import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { baccaratLogic } from './logic'
import { baccaratSelectAiAction } from './opponent'
import type { BaccaratGameState } from './types'

export type { BaccaratGameState } from './types'

const baccaratModule: GameModule<BaccaratGameState> = {
  moduleId: 'baccarat',
  ...baccaratLogic,
  selectAiAction: baccaratSelectAiAction,
}

registerGameModule(baccaratModule)
