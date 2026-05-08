import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { crazy8sLogic } from './logic'
import { crazy8sSelectAiAction } from './opponent'
import type { Crazy8sGameState } from './types'

const crazy8sModule: GameModule<Crazy8sGameState> = {
  moduleId: 'crazy-eights',
  ...crazy8sLogic,
  selectAiAction: crazy8sSelectAiAction,
}

registerGameModule(crazy8sModule)

export type { Crazy8sGameState } from './types'
