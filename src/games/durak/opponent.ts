import type { AiDifficulty } from '../../core/aiContext'
import { aiIsHardOrExpert } from '../../core/aiPlaystyle'
import type { SelectAiContext } from '../../core/gameModule'
import type { GameAction } from '../../core/types'
import type { TableState } from '../../core/types'
import { canBeat, handId, rankPower } from './helpers'
import type { DurakGameState } from './types'

/** Durak AI: low-card attacks and minimal winning defenses. */
export function durakSelectAiAction(
  table: TableState,
  gs: DurakGameState,
  playerIndex: number,
  rng: () => number,
  context: SelectAiContext,
): GameAction | null {
  if (gs.phase !== 'play' || playerIndex !== gs.currentPlayer) return null
  const d: AiDifficulty = context.difficulty
  const templates = table.templates
  if (gs.sub === 'attack') {
    const hz = table.zones[handId(gs.attacker)]!.cards
    if (!hz.length) return null
    if (d === 'easy' || d === 'medium') {
      return { type: 'custom', payload: { cmd: 'dukAttack', index: Math.floor(rng() * hz.length) } }
    }
    const battle0 = table.zones.battle?.cards[0]
    if (aiIsHardOrExpert(d) && battle0) {
      const at = battle0.templateId
      const ar = templates[at]!.rank as string
      const same = hz
        .map((c, i) => ({ c, i }))
        .filter((x) => (templates[x.c.templateId]!.rank as string) === ar)
      if (same.length > 0) {
        return {
          type: 'custom',
          payload: { cmd: 'dukAttack', index: same[Math.floor(rng() * same.length)]!.i },
        }
      }
    }
    const byPow = [...hz.map((c, i) => ({ i, p: rankPower(templates[c.templateId]!.rank as string) }))].sort(
      (a, b) => a.p - b.p,
    )
    if (d === 'expert' && rng() < 0.1) {
      return { type: 'custom', payload: { cmd: 'dukAttack', index: byPow[byPow.length - 1]!.i } }
    }
    return { type: 'custom', payload: { cmd: 'dukAttack', index: byPow[0]!.i } }
  }
  const battle = table.zones.battle!.cards
  if (battle.length !== 1) return null
  const attackTid = battle[0]!.templateId
  const hz = table.zones[handId(gs.defender)]!.cards
  const beats = hz
    .map((c, i) => (canBeat(table.templates, attackTid, c.templateId, gs.trumpSuit) ? i : -1))
    .filter((i) => i >= 0)
  if (beats.length > 0) {
    if (d === 'easy' && rng() < 0.32) {
      return { type: 'custom', payload: { cmd: 'dukDefend', index: beats[Math.floor(rng() * beats.length)]! } }
    }
    if (d === 'medium' && rng() < 0.2) {
      return { type: 'custom', payload: { cmd: 'dukDefend', index: beats[Math.floor(rng() * beats.length)]! } }
    }
    const byMin = beats.sort(
      (a, b) =>
        rankPower(templates[hz[a]!.templateId]!.rank as string) -
        rankPower(templates[hz[b]!.templateId]!.rank as string),
    )[0]!
    if (d === 'expert' && rng() < 0.08) {
      return { type: 'custom', payload: { cmd: 'dukTake' } }
    }
    return { type: 'custom', payload: { cmd: 'dukDefend', index: byMin } }
  }
  return { type: 'custom', payload: { cmd: 'dukTake' } }
}
