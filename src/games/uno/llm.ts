import type { GameAction } from '../../core/types'
import type { TableState } from '../../core/types'
import { cmd, handId, tpl, uc, uface } from './helpers'
import type { UnoGameState } from './types'

export function describeUnoLegalChoice(
  table: TableState,
  gameState: UnoGameState,
  action: GameAction,
  viewerPlayerIndex: number,
): string | undefined {
  if (gameState.phase !== 'play' || gameState.currentPlayer !== viewerPlayerIndex) return undefined
  if (action.type !== 'custom') return undefined
  const c = cmd(action.payload)
  const hz = table.zones[handId(viewerPlayerIndex)]?.cards
  if (c === 'unoDraw') return 'Draw from pile'
  if (c === 'unoPass') return 'Pass (no draw possible)'
  if (c === 'unoPassAfterDraw') return 'End turn after draw'
  if (c !== 'unoPlay' || !hz) return undefined
  const ix = Number((action.payload as { index?: number }).index)
  if (!Number.isFinite(ix) || ix < 0 || ix >= hz.length) return undefined
  const card = hz[ix]!
  const t = tpl(table.templates, card.templateId)
  const face = uface(t)
  const color = uc(t)
  const wildPick = (action.payload as { color?: string }).color
  if (color === 'w' && wildPick) return `Play Wild → choose ${wildPick}`
  return `Play ${color}/${face} (#${ix})`
}

export function summarizeUnoLedgerAction(action: GameAction): string | undefined {
  if (action.type !== 'custom') return undefined
  const c = cmd(action.payload)
  if (c === 'unoDraw') return 'uno:draw'
  if (c === 'unoPass') return 'uno:pass'
  if (c === 'unoPassAfterDraw') return 'uno:passAfterDraw'
  if (c === 'unoPlay') {
    const ix = Number((action.payload as { index?: number }).index)
    const col = (action.payload as { color?: string }).color
    return col ? `uno:play#${ix}→${col}` : `uno:play#${ix}`
  }
  return undefined
}
