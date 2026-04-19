import { playerSeatLabel } from './playerLabels'
import type { GameManifestYaml } from './types'

/** Optional multi-round / cumulative scoring (enabled per game via manifest.match). */
export interface MatchConfig {
  enabled: boolean
  /** Cumulative threshold that can end the match (e.g. Skyjo: 100). */
  targetScore: number
  /** How to pick the overall winner when the match ends. */
  winnerIs: 'lowest' | 'highest'
  /** End when any player’s cumulative total reaches targetScore (Skyjo-style). */
  endCondition: 'anyAtOrAbove'
}

export interface MatchState {
  /** 1-based round number for the deal currently in play (or just finished). */
  round: number
  cumulativeScores: number[]
  config: MatchConfig
  /** Set when a player’s cumulative score crosses the threshold. */
  complete: boolean
  /** Index of winning player when complete; null if tie (rare). */
  matchWinnerIndex: number | null
}

export function parseMatchConfig(manifest: GameManifestYaml): MatchConfig | undefined {
  const m = manifest.match
  if (!m?.enabled) return undefined
  return {
    enabled: true,
    targetScore: typeof m.targetScore === 'number' ? m.targetScore : 100,
    winnerIs: m.winnerIs === 'highest' ? 'highest' : 'lowest',
    endCondition: m.endCondition === 'anyAtOrAbove' ? 'anyAtOrAbove' : 'anyAtOrAbove',
  }
}

export function createInitialMatchState(manifest: GameManifestYaml): MatchState | undefined {
  const config = parseMatchConfig(manifest)
  if (!config) return undefined
  const n = manifest.players.human + manifest.players.ai
  const start = manifest.match?.startingStack
  const useStack =
    typeof start === 'number' && Number.isFinite(start) && start > 0
  const cumulativeScores = useStack ? Array.from({ length: n }, () => start) : Array.from({ length: n }, () => 0)
  return {
    round: 1,
    cumulativeScores,
    config,
    complete: false,
    matchWinnerIndex: null,
  }
}

function indexOfExtreme(scores: number[], mode: 'lowest' | 'highest'): number {
  if (scores.length === 0) return 0
  if (mode === 'lowest') {
    let min = Infinity
    let idx = 0
    scores.forEach((s, i) => {
      if (s < min) {
        min = s
        idx = i
      }
    })
    return idx
  }
  let max = -Infinity
  let idx = 0
  scores.forEach((s, i) => {
    if (s > max) {
      max = s
      idx = i
    }
  })
  return idx
}

/**
 * Merge a finished round into cumulative scores and evaluate match end (anyAtOrAbove).
 */
export function applyFinishedRound(
  match: MatchState,
  roundScores: number[],
): MatchState {
  const next = match.cumulativeScores.map((c, i) => c + (roundScores[i] ?? 0))
  const { targetScore, winnerIs, endCondition } = match.config

  if (endCondition === 'anyAtOrAbove' && next.some((s) => s >= targetScore)) {
    const win = indexOfExtreme(next, winnerIs)
    return {
      ...match,
      cumulativeScores: next,
      complete: true,
      matchWinnerIndex: win,
    }
  }

  return {
    ...match,
    cumulativeScores: next,
    round: match.round + 1,
    complete: false,
    matchWinnerIndex: null,
  }
}

export function formatMatchSummary(match: MatchState, manifest?: GameManifestYaml): string {
  const cum = match.cumulativeScores.map((s, i) => `${playerSeatLabel(i)}: ${s}`).join(' · ')
  const chips = manifest?.match?.scoringMode === 'chips'
  const unit = chips ? 'chips' : 'points'
  let line = `Round ${match.round} — cumulative ${cum} (stop when someone reaches ≥${match.config.targetScore} ${unit}; ${match.config.winnerIs} total wins)`
  if (match.complete && match.matchWinnerIndex !== null) {
    line += ` — Match winner: ${playerSeatLabel(match.matchWinnerIndex)}`
  }
  return line
}
