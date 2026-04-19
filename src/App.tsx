import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { AI_DIFFICULTY_OPTIONS, normalizeAiDifficulty, type AiDifficulty } from './core/aiContext'
import { type MatchState } from './core/match'
import { playerSeatLabel } from './core/playerLabels'
import { createSession, startNextMatchRound, type CreateSessionOptions, type GameSession } from './session'
import { GAME_IDS } from './data/manifests'
import { rulesTextForGame } from './data/rulesSources'
import {
  clampAiOpponentCount,
  gameSupportsConfigurableAi,
  gameSupportsPerSeatAiDifficulty,
  MAX_AI_OPPONENTS,
  normalizeAiDifficultiesForCount,
} from './session/playerConfig'
import { RulesModal } from './ui/RulesModal'
import { TableView, type ActiveTurnHighlight, type TableIntent } from './ui/TableView'
import { skyjoDumpUiStepShouldReset, type SkyjoDumpUiStep } from './ui/tableUiFlow'
import type { GameAction } from './core/types'
import type { GoFishGameState } from './games/go-fish'
import { isSkyjoSlotTemplateId, type SkyjoGameState } from './games/skyjo'

function MatchCumulativePanel({
  match,
  toolbar,
  scoreColumnLabel = 'Total',
  caption = 'Cumulative scores',
  scoringMode = 'points',
}: {
  match: MatchState
  toolbar?: boolean
  scoreColumnLabel?: string
  caption?: string
  scoringMode?: 'points' | 'chips'
}) {
  const unit = scoringMode === 'chips' ? 'chips' : 'points'
  return (
    <div className={`matchCumulative${toolbar ? ' matchCumulative--toolbar' : ''}`}>
      <table className="matchCumulative__table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">{scoreColumnLabel}</th>
          </tr>
        </thead>
        <tbody>
          {match.cumulativeScores.map((s, i) => (
            <tr key={i}>
              <td>{playerSeatLabel(i)}</td>
              <td>{s}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="matchCumulative__meta">
        Round {match.round}
        {' · '}
        Stop when someone reaches ≥{match.config.targetScore} {unit} · {match.config.winnerIs} total wins
        {match.complete && match.matchWinnerIndex !== null && (
          <> — Winner: {playerSeatLabel(match.matchWinnerIndex)}</>
        )}
      </p>
    </div>
  )
}

function isGoFishSession(s: GameSession): s is GameSession<GoFishGameState> {
  return s.manifest.module === 'go-fish'
}

/** Opponent index from `hand:i` or `books:i` (Go Fish ask target). */
function goFishTargetPlayerFromZoneId(zoneId: string): number | null {
  const h = /^hand:(\d+)$/.exec(zoneId)
  if (h) return Number(h[1])
  const b = /^books:(\d+)$/.exec(zoneId)
  if (b) return Number(b[1])
  return null
}

function goFishOpponentIntentZones(playerCount: number): string[] {
  const z: string[] = []
  for (let i = 1; i < playerCount; i++) {
    z.push(`hand:${i}`, `books:${i}`)
  }
  return z
}

function isSkyjoSession(s: GameSession): s is GameSession<SkyjoGameState> {
  return s.manifest.module === 'skyjo'
}

function isCrazyEightsSession(s: GameSession): boolean {
  return s.manifest.module === 'crazy-eights'
}

function isUnoSession(s: GameSession): boolean {
  return s.manifest.module === 'uno'
}

function customActionKey(a: GameAction): string {
  if (a.type !== 'custom') return ''
  return JSON.stringify(a.payload)
}

function labelCustomAction(a: GameAction): string {
  if (a.type !== 'custom') return 'Action'
  const p = a.payload as Record<string, unknown>
  const cmd = typeof p.cmd === 'string' ? p.cmd : ''
  switch (cmd) {
    case 'bjBet':
      return `Bet ${p.amount}`
    case 'bjHit':
      return 'Hit'
    case 'bjStand':
      return 'Stand'
    case 'bacBet':
      return `${p.side === 'banker' ? 'Banker' : 'Player'} ${p.amount}`
    case 'p5Ante':
      return 'Pay ante'
    case 'p5Draw':
      return `Replace ${p.count} card(s)`
    case 'hcBet':
      return `Bet ${p.amount}`
    case 'c8Draw':
      return 'Draw'
    case 'c8Play': {
      const suit = p.suit
      const ix = p.index
      if (typeof suit === 'string') return `Play #${ix} · ${suit}`
      return `Play card #${ix}`
    }
    case 'unoDraw':
      return 'Draw'
    case 'unoPass':
      return 'Pass'
    case 'unoPassAfterDraw':
      return 'End turn (keep card)'
    case 'unoPlay': {
      const ix = p.index
      const col = p.color
      const names: Record<string, string> = { r: 'Red', y: 'Yellow', g: 'Green', b: 'Blue' }
      if (typeof col === 'string' && names[col]) return `Wild → ${names[col]} (#${ix})`
      return `Play #${ix}`
    }
    default:
      return cmd || 'Custom'
  }
}

function difficultyForAiPlayer(session: GameSession, playerIndex: number): AiDifficulty {
  if (playerIndex <= 0) return 'medium'
  const cfg = session.aiPlayerConfig?.difficulties
  const ix = playerIndex - 1
  return cfg && ix >= 0 && ix < cfg.length ? normalizeAiDifficulty(cfg[ix]) : 'medium'
}

function App() {
  const [gameId, setGameId] = useState<(typeof GAME_IDS)[number]>('war')
  const [aiOpponents, setAiOpponents] = useState(1)
  const [aiDifficulties, setAiDifficulties] = useState<AiDifficulty[]>(['medium'])
  const [session, setSession] = useState<GameSession | null>(null)

  const [gfAwaitingOpponent, setGfAwaitingOpponent] = useState(false)
  const [gfRank, setGfRank] = useState('A')
  const [skyjoDumpStep, setSkyjoDumpStep] = useState<SkyjoDumpUiStep>('idle')
  const [rulesOpen, setRulesOpen] = useState(false)

  const makeDealOptions = useCallback(
    (
      skipMatch?: boolean,
      forGameId: (typeof GAME_IDS)[number] = gameId,
      difficultyList?: AiDifficulty[],
    ): CreateSessionOptions | undefined => {
      if (!gameSupportsConfigurableAi(forGameId)) {
        return skipMatch ? { skipMatch: true } : undefined
      }
      const diffs = difficultyList ?? aiDifficulties
      return {
        aiCount: aiOpponents,
        aiDifficulties: normalizeAiDifficultiesForCount(aiOpponents, diffs),
        ...(skipMatch ? { skipMatch: true } : {}),
      }
    },
    [gameId, aiOpponents, aiDifficulties],
  )

  const applyFreshDeal = useCallback(
    (id: (typeof GAME_IDS)[number], options?: CreateSessionOptions) => {
      setSession(createSession(id, Math.random, undefined, options ?? makeDealOptions(undefined, id)))
      setGfAwaitingOpponent(false)
      setGfRank('A')
      setSkyjoDumpStep('idle')
    },
    [makeDealOptions],
  )

  const onGameIdChange = useCallback((id: (typeof GAME_IDS)[number]) => {
    setGameId(id)
    setSession(null)
    setGfAwaitingOpponent(false)
    setGfRank('A')
    setSkyjoDumpStep('idle')
  }, [])

  const startOrNewDeal = useCallback(() => {
    applyFreshDeal(gameId)
  }, [gameId, applyFreshDeal])

  const endGame = useCallback(() => {
    if (!session) return
    if (
      !window.confirm(
        'End this session? The table clears, any match progress is abandoned, and AI count and difficulty settings unlock.',
      )
    ) {
      return
    }
    setSession(createSession(gameId, Math.random, undefined, makeDealOptions(true)))
    setSkyjoDumpStep('idle')
    setGfAwaitingOpponent(false)
    setGfRank('A')
  }, [session, gameId, makeDealOptions])

  const onNextMatchRound = useCallback(() => {
    if (!session) return
    try {
      const next = startNextMatchRound(session, gameId)
      setSession(next)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    }
  }, [session, gameId])

  const dispatchAction = useCallback((action: GameAction) => {
    setSession((prev) => {
      if (!prev) return prev
      const result = prev.module.applyAction(prev.table, prev.gameState, action)
      if (result.error) {
        window.alert(result.error)
        return prev
      }
      return {
        ...prev,
        table: result.table,
        gameState: result.gameState,
      }
    })
  }, [])

  const status = useMemo(() => {
    if (!session) return ''
    return session.module.statusText(session.table, session.gameState)
  }, [session])

  const canAdvanceMatch = useMemo(() => {
    if (!session) return false
    const m = session.match
    if (!m?.config || m.complete) return false
    const mod = session.module
    return !!(
      mod.isMatchRoundFinished?.(session.gameState) &&
      mod.extractMatchRoundScores?.(session.gameState)?.length
    )
  }, [session])

  const matchPreviewTotals = useMemo(() => {
    if (!session) return null
    const m = session.match
    if (!m?.config || m.complete) return null
    const mod = session.module
    if (!mod.isMatchRoundFinished?.(session.gameState)) return null
    const rs = mod.extractMatchRoundScores?.(session.gameState)
    if (!rs?.length) return null
    return m.cumulativeScores.map((c, i) => c + (rs[i] ?? 0))
  }, [session])

  const primaryLabel = gameId === 'demo-custom' ? 'Reveal winner' : 'Play round'

  const onPrimary = useCallback(() => {
    dispatchAction({ type: 'step' })
  }, [dispatchAction])

  const legal = useMemo(() => {
    if (!session) return [] as GameAction[]
    return session.module.getLegalActions(session.table, session.gameState)
  }, [session])

  const legalCustomActions = useMemo(
    () => legal.filter((a): a is Extract<GameAction, { type: 'custom' }> => a.type === 'custom'),
    [legal],
  )

  const hidePlayRoundButton = useMemo(() => {
    if (!session) return false
    const m = session.manifest.module
    return (
      m === 'go-fish' ||
      m === 'skyjo' ||
      m === 'blackjack' ||
      m === 'baccarat' ||
      m === 'poker-draw' ||
      m === 'high-card-duel' ||
      m === 'crazy-eights' ||
      m === 'uno'
    )
  }, [session])

  const activeTurnHighlight = useMemo((): ActiveTurnHighlight | undefined => {
    if (!session) return undefined
    if (isSkyjoSession(session) && session.gameState.phase !== 'roundOver') {
      return { playerIndex: session.gameState.currentPlayer, zoneIdPrefix: 'grid' }
    }
    if (isGoFishSession(session) && session.gameState.phase === 'playing') {
      return { playerIndex: session.gameState.currentPlayer, zoneIdPrefix: 'hand' }
    }
    if (isCrazyEightsSession(session) && (session.gameState as { phase?: string }).phase === 'play') {
      return {
        playerIndex: (session.gameState as { currentPlayer: number }).currentPlayer,
        zoneIdPrefix: 'hand',
      }
    }
    if (isUnoSession(session) && (session.gameState as { phase?: string }).phase === 'play') {
      return {
        playerIndex: (session.gameState as { currentPlayer: number }).currentPlayer,
        zoneIdPrefix: 'hand',
      }
    }
    return undefined
  }, [session])

  const humanRanks = useMemo(() => {
    if (!session || !isGoFishSession(session)) return [] as string[]
    const hz = session.table.zones['hand:0']?.cards ?? []
    const s = new Set<string>()
    for (const c of hz) {
      const r = session.table.templates[c.templateId]?.rank
      if (typeof r === 'string') s.add(r)
    }
    return [...s].sort()
  }, [session])

  useEffect(() => {
    if (!session) return
    if (!isGoFishSession(session)) return
    const gs = session.gameState
    if (gs.phase !== 'playing' || gs.currentPlayer === 0) return

    const handle = window.setTimeout(() => {
      setSession((prev) => {
        if (!prev || !isGoFishSession(prev)) return prev
        const g = prev.gameState
        if (g.phase !== 'playing' || g.currentPlayer === 0) return prev
        const act = prev.module.selectAiAction(prev.table, prev.gameState, g.currentPlayer, Math.random, {
          difficulty: difficultyForAiPlayer(prev, g.currentPlayer),
        })
        if (!act) return prev
        const r = prev.module.applyAction(prev.table, prev.gameState, act)
        if (r.error) return prev
        return { ...prev, table: r.table, gameState: r.gameState }
      })
    }, 550)

    return () => window.clearTimeout(handle)
  }, [session])

  useEffect(() => {
    if (!session) return
    if (!isCrazyEightsSession(session)) return
    const gs = session.gameState as { phase?: string; currentPlayer?: number }
    if (gs.phase !== 'play' || gs.currentPlayer === 0) return

    const handle = window.setTimeout(() => {
      setSession((prev) => {
        if (!prev || !isCrazyEightsSession(prev)) return prev
        const g = prev.gameState as { phase?: string; currentPlayer?: number }
        if (g.phase !== 'play' || g.currentPlayer === 0) return prev
        const act = prev.module.selectAiAction(
          prev.table,
          prev.gameState,
          g.currentPlayer!,
          Math.random,
          { difficulty: 'medium' },
        )
        if (!act) return prev
        const r = prev.module.applyAction(prev.table, prev.gameState, act)
        if (r.error) return prev
        return { ...prev, table: r.table, gameState: r.gameState }
      })
    }, 500)

    return () => window.clearTimeout(handle)
  }, [session])

  useEffect(() => {
    if (!session) return
    if (!isUnoSession(session)) return
    const gs = session.gameState as { phase?: string; currentPlayer?: number }
    if (gs.phase !== 'play' || gs.currentPlayer === 0) return

    const handle = window.setTimeout(() => {
      setSession((prev) => {
        if (!prev || !isUnoSession(prev)) return prev
        const g = prev.gameState as { phase?: string; currentPlayer?: number }
        if (g.phase !== 'play' || g.currentPlayer === 0) return prev
        const act = prev.module.selectAiAction(
          prev.table,
          prev.gameState,
          g.currentPlayer!,
          Math.random,
          { difficulty: 'medium' },
        )
        if (!act) return prev
        const r = prev.module.applyAction(prev.table, prev.gameState, act)
        if (r.error) return prev
        return { ...prev, table: r.table, gameState: r.gameState }
      })
    }, 500)

    return () => window.clearTimeout(handle)
  }, [session])

  useEffect(() => {
    if (!session) return
    if (!isSkyjoSession(session)) return
    const gs = session.gameState
    if (gs.phase === 'roundOver' || gs.currentPlayer === 0) return

    const handle = window.setTimeout(() => {
      setSession((prev) => {
        if (!prev || !isSkyjoSession(prev)) return prev
        const g = prev.gameState
        if (g.phase === 'roundOver' || g.currentPlayer === 0) return prev
        const act = prev.module.selectAiAction(prev.table, prev.gameState, g.currentPlayer, Math.random, {
          difficulty: difficultyForAiPlayer(prev, g.currentPlayer),
        })
        if (!act) return prev
        const r = prev.module.applyAction(prev.table, prev.gameState, act)
        if (r.error) return prev
        return { ...prev, table: r.table, gameState: r.gameState }
      })
    }, 650)

    return () => window.clearTimeout(handle)
  }, [session])

  useEffect(() => {
    if (!session) return
    if (!isSkyjoSession(session)) return
    if (skyjoDumpUiStepShouldReset(session.gameState)) {
      setSkyjoDumpStep('idle')
    }
  }, [session])

  useEffect(() => {
    setAiDifficulties((prev) => {
      const next = prev.slice(0, aiOpponents)
      while (next.length < aiOpponents) next.push('medium')
      return next
    })
  }, [aiOpponents])

  useEffect(() => {
    if (!session) return
    if (!isGoFishSession(session)) return
    const g = session.gameState
    if (g.phase !== 'playing' || g.currentPlayer !== 0) {
      setGfAwaitingOpponent(false)
    }
  }, [session])

  const aiCountLocked = Boolean(session?.match && !session.match.complete)

  const tableIntentZones = useMemo((): readonly string[] | undefined => {
    if (!session) return undefined
    if (isSkyjoSession(session) && session.gameState.phase !== 'roundOver' && session.gameState.currentPlayer === 0) {
      const gs = session.gameState
      if (gs.pendingDraw) {
        if (gs.pendingFromDiscard) return ['grid:0']
        return ['grid:0', 'discard']
      }
      return ['draw', 'grid:0']
    }
    if (isGoFishSession(session) && session.gameState.phase === 'playing' && session.gameState.currentPlayer === 0) {
      const pc = session.gameState.playerCount
      if (!gfAwaitingOpponent) {
        return ['hand:0']
      }
      return ['hand:0', ...goFishOpponentIntentZones(pc)]
    }
    return undefined
  }, [session, gfAwaitingOpponent])

  const handleTableIntent = useCallback(
    (intent: TableIntent) => {
      if (!session) return
      if (isSkyjoSession(session)) {
        const gs = session.gameState
        if (gs.phase === 'roundOver' || gs.currentPlayer !== 0) return

        if (intent.kind === 'stack' && intent.zoneId === 'draw') {
          dispatchAction({ type: 'skyjoDraw', from: 'deck' })
          return
        }

        if (intent.kind === 'stack' && intent.zoneId === 'discard') {
          if (!gs.pendingDraw || gs.pendingFromDiscard) return
          setSkyjoDumpStep((s) => (s === 'selectFlip' ? 'idle' : 'selectFlip'))
          return
        }

        if (intent.kind === 'card' && intent.zoneId === 'grid:0') {
          const idx = intent.cardIndex
          const grid = session.table.zones['grid:0']?.cards
          const cell = grid?.[idx]
          if (gs.pendingDraw) {
            const legalDumpTarget =
              !!cell &&
              !cell.faceUp &&
              !gs.pendingFromDiscard &&
              !isSkyjoSlotTemplateId(cell.templateId)

            if (skyjoDumpStep === 'selectFlip') {
              if (legalDumpTarget) {
                dispatchAction({ type: 'skyjoDumpDraw', flipIndex: idx })
              } else {
                window.alert('Choose a face-down card on your grid to complete dump & flip (or click the discard pile again to cancel).')
              }
              return
            }

            const canDumpShortcut =
              intent.modifiers.shiftKey && legalDumpTarget
            if (canDumpShortcut) {
              dispatchAction({ type: 'skyjoDumpDraw', flipIndex: idx })
            } else {
              dispatchAction({ type: 'skyjoSwapDrawn', gridIndex: idx })
            }
          } else {
            dispatchAction({ type: 'skyjoTakeDiscard', gridIndex: idx })
          }
        }
        return
      }

      if (isGoFishSession(session)) {
        const gs = session.gameState
        if (gs.phase !== 'playing' || gs.currentPlayer !== 0) return

        if (intent.kind === 'card' && intent.zoneId === 'hand:0') {
          const card = session.table.zones['hand:0']?.cards[intent.cardIndex]
          const r = card && session.table.templates[card.templateId]?.rank
          if (typeof r === 'string') {
            setGfRank(r)
            setGfAwaitingOpponent(true)
          }
          return
        }

        if (!gfAwaitingOpponent) return

        if (intent.kind === 'card' || intent.kind === 'zone') {
          const target = goFishTargetPlayerFromZoneId(intent.zoneId)
          if (target === null || target === 0) return
          const rank =
            humanRanks.includes(gfRank) ? gfRank : humanRanks[0] ?? ''
          if (!rank) {
            window.alert('You have no cards to ask with.')
            return
          }
          const action: GameAction = { type: 'goFishAsk', targetPlayer: target, rank }
          const preview = session.module.applyAction(session.table, session.gameState, action)
          if (preview.error) {
            window.alert(preview.error)
            return
          }
          dispatchAction(action)
          setGfAwaitingOpponent(false)
        }
      }
    },
    [session, dispatchAction, skyjoDumpStep, gfAwaitingOpponent, gfRank, humanRanks],
  )

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Card table</h1>
        <p className="app__subtitle">Runs entirely in your browser — decks and manifests are YAML.</p>
        <div className="app__toolbar">
          <div className="app__toolbarMain">
            <div className="app__toolbarLeft">
              <div className="app__toolbarRow app__toolbarRow--controls">
                <div className="app__toolbarControls">
                  <label className="app__label">
                    Game
                    <select
                      className="app__select"
                      value={gameId}
                      onChange={(e) => onGameIdChange(e.target.value as (typeof GAME_IDS)[number])}
                    >
                      {GAME_IDS.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  </label>
                  {gameSupportsConfigurableAi(gameId) && (
                    <label className="app__label">
                      AI opponents
                      <input
                        className="app__inputNumber"
                        type="number"
                        min={1}
                        max={MAX_AI_OPPONENTS}
                        value={aiOpponents}
                        disabled={aiCountLocked}
                        title={
                          aiCountLocked
                            ? 'Finish or advance the match before changing player count.'
                            : `1–${MAX_AI_OPPONENTS} computer players (${1 + aiOpponents} total). Applies on Start deal / New deal.`
                        }
                        onChange={(e) => {
                          const n = clampAiOpponentCount(gameId, Number(e.target.value))
                          setAiOpponents(n)
                        }}
                      />
                    </label>
                  )}
                  <div className="app__toolbarActions">
                    <span className="app__toolbarActionsLabel">Actions</span>
                    <div className="app__toolbarActionsBtns">
                      <button type="button" className="app__btnToolbar app__btnSecondary" onClick={startOrNewDeal}>
                        {session ? 'New deal' : 'Start deal'}
                      </button>
                      <button
                        type="button"
                        className="app__btnSecondary app__btnToolbar"
                        onClick={() => setRulesOpen(true)}
                      >
                        Rules
                      </button>
                      <button type="button" className="app__btnSecondary app__btnToolbar" onClick={endGame}>
                        End game
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {gameSupportsPerSeatAiDifficulty(gameId) && aiOpponents >= 1 && (
                <div className="app__toolbarRow app__toolbarRow--diff" role="group" aria-label="AI difficulty per seat">
                  {Array.from({ length: aiOpponents }, (_, i) => (
                    <label key={i} className="app__label app__label--inline">
                      Player {i + 2}
                      <select
                        className="app__select app__select--diff"
                        value={aiDifficulties[i] ?? 'medium'}
                        disabled={aiCountLocked}
                        title={
                          aiCountLocked
                            ? 'Finish or advance the match before editing AI settings.'
                            : 'Locked for this deal. Changing starts a new deal.'
                        }
                        onChange={(e) => {
                          const v = normalizeAiDifficulty(e.target.value)
                          if (
                            session &&
                            !window.confirm(
                              'Changing AI difficulty starts a new deal. Progress for this hand is lost. Continue?',
                            )
                          ) {
                            return
                          }
                          const next = [...aiDifficulties]
                          next[i] = v
                          while (next.length < aiOpponents) next.push('medium')
                          setAiDifficulties(next)
                          if (session) {
                            setSession(createSession(gameId, Math.random, undefined, makeDealOptions(undefined, gameId, next)))
                            setSkyjoDumpStep('idle')
                            setGfAwaitingOpponent(false)
                            setGfRank('A')
                          }
                        }}
                      >
                        {AI_DIFFICULTY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {session?.match && (
              <div className="app__toolbarScores">
                <MatchCumulativePanel
                  match={session.match}
                  toolbar
                  scoreColumnLabel={session.manifest.match?.scoreLabel ?? 'Total'}
                  caption={
                    session.manifest.match?.scoringMode === 'chips' ? 'Cumulative chips' : 'Cumulative scores'
                  }
                  scoringMode={session.manifest.match?.scoringMode === 'chips' ? 'chips' : 'points'}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {!session && (
        <p className="app__lobbyHint" role="status">
          Select a game, adjust AI options if needed, then press <strong>Start deal</strong>.
        </p>
      )}

      {session && (
        <>
          <p className="app__status" role="status">
            {status}
          </p>

          {matchPreviewTotals && session.match && !session.match.complete && (
            <p className="app__matchPreview" role="status">
              Totals if you merge this round:{' '}
              {matchPreviewTotals.map((s, i) => (
                <span key={i}>
                  {playerSeatLabel(i)}: {s}
                  {i < matchPreviewTotals.length - 1 ? ' · ' : ''}
                </span>
              ))}
            </p>
          )}
          {canAdvanceMatch && (
            <div className="app__matchActions">
              <button type="button" className="app__btnPrimary" onClick={onNextMatchRound}>
                Next round (apply scores)
              </button>
            </div>
          )}

          <TableView
            table={session.table}
            humanPlayerIndex={0}
            onTableIntent={tableIntentZones ? handleTableIntent : undefined}
            intentZoneAllowlist={tableIntentZones}
            pendingStacksColumn={
              isSkyjoSession(session)
                ? {
                    card: session.gameState.pendingDraw,
                    skyjoDumpStep: session.gameState.currentPlayer === 0 ? skyjoDumpStep : 'idle',
                  }
                : undefined
            }
            activeTurnHighlight={activeTurnHighlight}
          />

          <div className="app__actions">
            {gameId === 'go-fish' &&
              isGoFishSession(session) &&
              session.gameState.phase === 'playing' &&
              session.gameState.currentPlayer === 0 && (
                <div className="app__goFish">
                  <p className="app__tableIntentHint">
                    {gfAwaitingOpponent
                      ? 'Click an opponent’s hand or books pile to ask for that rank.'
                      : 'Click a card in your hand to choose the rank, then click an opponent’s hand or books.'}
                  </p>
                  {legal.some((a) => a.type === 'goFishPass') && (
                    <button type="button" className="app__btnSecondary" onClick={() => dispatchAction({ type: 'goFishPass' })}>
                      Pass turn
                    </button>
                  )}
                </div>
              )}

            {gameId === 'skyjo' &&
              isSkyjoSession(session) &&
              session.gameState.phase !== 'roundOver' &&
              session.gameState.currentPlayer === 0 && (
                <div className="app__skyjo">
                  <p className="app__tableIntentHint">
                    Draw from the deck (left). With a pending card from the deck, click the discard pile to start dump
                    &amp; flip, then a face-down grid card — or Shift+click a face-down card to do it in one step. Click
                    the grid to swap, or (no pending) click the grid to take the visible discard. Pending from the
                    discard pile must be placed (no dump).
                  </p>
                </div>
              )}

            {legalCustomActions.length > 0 && (
              <div className="app__customActions" role="group" aria-label="Game actions">
                {legalCustomActions.map((a) => (
                  <button
                    key={customActionKey(a)}
                    type="button"
                    className="app__btnSecondary"
                    onClick={() => dispatchAction(a)}
                  >
                    {labelCustomAction(a)}
                  </button>
                ))}
              </div>
            )}

            {gameId !== 'go-fish' && gameId !== 'skyjo' && !hidePlayRoundButton && (
              <button
                type="button"
                className="app__btnPrimary"
                onClick={onPrimary}
                disabled={legal.length === 0}
              >
                {primaryLabel}
              </button>
            )}
          </div>

          <footer className="app__footer">
            <span>
              {session.manifest.name} — deck <code>{session.manifest.deck}</code> — module{' '}
              <code>{session.manifest.module}</code>
            </span>
          </footer>
        </>
      )}

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} markdown={rulesTextForGame(gameId)} />
    </div>
  )
}

export default App
