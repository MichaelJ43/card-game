import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { sequenceRaceLogic } from './logic'
import { sequenceRaceSelectAiAction } from './opponent'
import type { SequenceRaceGameState } from './types'

const sequenceRaceModule: GameModule<SequenceRaceGameState> = {
  moduleId: 'sequence-race',
  ...sequenceRaceLogic,
  selectAiAction: sequenceRaceSelectAiAction,
}

registerGameModule(sequenceRaceModule)

export type { SequenceRaceGameState } from './types'
