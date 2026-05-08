import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { canastaLogic } from './logic'
import { canastaSelectAiAction } from './opponent'
import type { CanastaGameState } from './types'

const canastaModule: GameModule<CanastaGameState> = {
  moduleId: 'canasta',
  ...canastaLogic,
  selectAiAction: canastaSelectAiAction,
}

registerGameModule(canastaModule)

export type { CanastaGameState } from './types'
