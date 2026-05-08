import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { euchreLogic } from './logic'
import { euchreSelectAiAction } from './opponent'
import type { EuchreGameState } from './types'

const euchreModule: GameModule<EuchreGameState> = {
  moduleId: 'euchre',
  ...euchreLogic,
  selectAiAction: euchreSelectAiAction,
}

registerGameModule(euchreModule)

export type { EuchreGameState } from './types'
