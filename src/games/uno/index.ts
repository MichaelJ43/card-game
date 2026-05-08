import type { GameModule } from '../../core/gameModule'
import { registerGameModule } from '../../core/registry'
import { describeUnoLegalChoice, summarizeUnoLedgerAction } from './llm'
import { unoLogic } from './logic'
import { unoSelectAiAction } from './opponent'
import type { UnoGameState } from './types'

export type { UnoGameState } from './types'

const unoModule: GameModule<UnoGameState> = {
  moduleId: 'uno',
  ...unoLogic,
  selectAiAction: unoSelectAiAction,
  describeLegalChoice: describeUnoLegalChoice,
  summarizeLedgerAction: summarizeUnoLedgerAction,
}

registerGameModule(unoModule)
