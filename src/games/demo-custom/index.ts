import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { demoLogic } from './logic'
import { demoCustomSelectAiAction } from './opponent'
import type { DemoCustomState } from './types'

const demoCustomModule: GameModule<DemoCustomState> = {
  moduleId: 'demo-custom',
  ...demoLogic,
  selectAiAction: demoCustomSelectAiAction,
}

registerGameModule(demoCustomModule)
