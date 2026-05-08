import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { skyjoLogic } from './logic'
import type { SkyjoGameState } from './types'

export { isSkyjoSlotTemplateId } from './helpers'
export type { SkyjoGameState } from './types'

const skyjoModule: GameModule<SkyjoGameState> = skyjoLogic

registerGameModule(skyjoModule)
