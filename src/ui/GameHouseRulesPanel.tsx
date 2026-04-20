import { useEffect, useId, useMemo, useReducer, useState } from 'react'
import type { GameManifestYaml } from '../core/types'
import {
  clampMatchTargetScore,
  defaultReshuffleDiscardWhenDrawEmpty,
  GAMES_WITH_DISCARD_RECYCLE_OPTION,
  getHouseRulesForGame,
  patchHouseRulesForGame,
} from '../data/houseRules'
import type { RulesGameId } from '../data/rulesSources'

export interface GameHouseRulesPanelProps {
  gameId: RulesGameId
  manifest: GameManifestYaml
}

export function GameHouseRulesPanel({ gameId, manifest }: GameHouseRulesPanelProps) {
  const legendId = useId()
  const matchEnabled = manifest.match?.enabled === true
  const defaultTarget = typeof manifest.match?.targetScore === 'number' ? manifest.match.targetScore : 100
  const scoringMode = manifest.match?.scoringMode === 'chips' ? 'chips' : 'points'
  const unit = scoringMode === 'chips' ? 'chips' : 'points'

  const [targetStr, setTargetStr] = useState(() =>
    String(getHouseRulesForGame(gameId).matchTargetScore ?? defaultTarget),
  )
  const [skyjoDiscardOnly, setSkyjoDiscardOnly] = useState(
    () => !!getHouseRulesForGame(gameId).skyjoDiscardSwapFaceUpOnly,
  )
  const [dealerSoft17, setDealerSoft17] = useState(() => !!getHouseRulesForGame(gameId).dealerHitsSoft17)
  const [warTie, setWarTie] = useState<'1' | '3'>(() =>
    getHouseRulesForGame(gameId).warTieDownCards === 1 ? '1' : '3',
  )
  const [houseRulesGen, bumpHouseRules] = useReducer((x: number) => x + 1, 0)
  const houseRules = useMemo(() => {
    void houseRulesGen
    return getHouseRulesForGame(gameId)
  }, [gameId, houseRulesGen])
  const reshuffleDiscard =
    houseRules.reshuffleDiscardWhenDrawEmpty ?? defaultReshuffleDiscardWhenDrawEmpty(gameId, manifest)

  useEffect(() => {
    const h = getHouseRulesForGame(gameId)
    setTargetStr(String(h.matchTargetScore ?? defaultTarget))
    setSkyjoDiscardOnly(!!h.skyjoDiscardSwapFaceUpOnly)
    setDealerSoft17(!!h.dealerHitsSoft17)
    setWarTie(h.warTieDownCards === 1 ? '1' : '3')
  }, [gameId, defaultTarget])

  const onTargetBlur = () => {
    const n = clampMatchTargetScore(Number(targetStr), defaultTarget)
    setTargetStr(String(n))
    if (n === defaultTarget) {
      patchHouseRulesForGame(gameId, { matchTargetScore: null })
    } else {
      patchHouseRulesForGame(gameId, { matchTargetScore: n })
    }
  }

  return (
    <div className="app__houseRules" role="group" aria-labelledby={legendId}>
      <h3 id={legendId} className="app__houseRulesLegend">
        Options for this game
      </h3>
      <p className="app__houseRulesHint">
        Saved in your browser. Start a <strong>new deal</strong> (or next match round) for changes to apply.
      </p>

      {matchEnabled && (
        <label className="app__houseRulesRow">
          <span>End match when someone reaches ≥</span>
          <input
            className="app__inputNumber app__inputNumber--narrow"
            type="number"
            min={10}
            max={999}
            value={targetStr}
            onChange={(e) => setTargetStr(e.target.value)}
            onBlur={onTargetBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          <span>{unit} ({manifest.match?.winnerIs === 'highest' ? 'highest' : 'lowest'} total wins)</span>
        </label>
      )}

      {GAMES_WITH_DISCARD_RECYCLE_OPTION.has(gameId) && (
        <label className="app__houseRulesCheck">
          <input
            type="checkbox"
            checked={reshuffleDiscard}
            onChange={(e) => {
              patchHouseRulesForGame(gameId, { reshuffleDiscardWhenDrawEmpty: e.target.checked })
              bumpHouseRules()
            }}
          />
          <span>
            When the <strong>draw pile</strong> is empty, shuffle the <strong>discard pile</strong> into a new draw pile
            (top discard stays face-up).
          </span>
        </label>
      )}

      {gameId === 'skyjo' && (
        <label className="app__houseRulesCheck">
          <input
            type="checkbox"
            checked={skyjoDiscardOnly}
            onChange={(e) => {
              const on = e.target.checked
              setSkyjoDiscardOnly(on)
              patchHouseRulesForGame(gameId, { skyjoDiscardSwapFaceUpOnly: on ? true : null })
            }}
          />
          <span>
            Discard pile may only replace <strong>face-up</strong> grid cards (face-down cells use the deck only)
          </span>
        </label>
      )}

      {(gameId === 'blackjack' || gameId === 'casino-blackjack') && (
        <label className="app__houseRulesCheck">
          <input
            type="checkbox"
            checked={dealerSoft17}
            onChange={(e) => {
              const on = e.target.checked
              setDealerSoft17(on)
              patchHouseRulesForGame(gameId, { dealerHitsSoft17: on ? true : null })
            }}
          />
          <span>Dealer hits soft 17</span>
        </label>
      )}

      {gameId === 'war' && (
        <label className="app__houseRulesRow">
          <span>On a tie (war)</span>
          <select
            className="app__select"
            value={warTie}
            onChange={(e) => {
              const v = e.target.value === '1' ? '1' : '3'
              setWarTie(v)
              if (v === '3') {
                patchHouseRulesForGame(gameId, { warTieDownCards: null })
              } else {
                patchHouseRulesForGame(gameId, { warTieDownCards: 1 })
              }
            }}
          >
            <option value="3">Classic — each player puts 3 cards face-down, then flips</option>
            <option value="1">Quick — 1 face-down card each, then flip</option>
          </select>
        </label>
      )}

      {!matchEnabled &&
        gameId !== 'skyjo' &&
        gameId !== 'war' &&
        gameId !== 'blackjack' &&
        gameId !== 'casino-blackjack' &&
        !GAMES_WITH_DISCARD_RECYCLE_OPTION.has(gameId) && (
          <p className="app__houseRulesNone">
            No optional table rules are configurable in the app for this game yet (open Rules on Skyjo, War, or Blackjack
            variants to see examples).
          </p>
        )}
    </div>
  )
}
