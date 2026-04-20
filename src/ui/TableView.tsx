import { Fragment, useMemo, type MouseEvent } from 'react'
import { playerSeatLabel } from '../core/playerLabels'
import type { CardInstance, TableState, Zone } from '../core/types'
import { CardView } from './CardView'
import type { TableIntent } from './tableIntent'
import { pointerModifiersFromEvent } from './tableIntent'
import type { SkyjoDumpUiStep } from './tableUiFlow'
import './TableView.css'

export type { TableIntent } from './tableIntent'
export type { SkyjoDumpUiStep } from './tableUiFlow'

/** Highlights `zoneIdPrefix` + `:` + `playerIndex` (e.g. `grid:2`, `hand:1`). */
export interface ActiveTurnHighlight {
  playerIndex: number
  zoneIdPrefix: string
}

export interface TableViewProps {
  table: TableState
  /** Player index for the human; their pile cards can be shown face-down but “owned” */
  humanPlayerIndex?: number
  /**
   * Server seat index → display name for opponents (not used for the viewer seat; that stays “You” / “Your …”).
   * When omitted, {@link playerSeatLabel} is used for other seats.
   */
  getSeatDisplayName?: (serverPlayerIndex: number) => string
  /**
   * When set together with {@link intentZoneAllowlist}, card and stack clicks emit intents.
   * Games map these to {@link import('../core/types').GameAction}s in the shell (e.g. App).
   */
  onTableIntent?: (intent: TableIntent) => void
  /**
   * Zone ids that participate in table intents (e.g. `draw`, `grid:0`, `hand:0`).
   * Omit or leave empty to disable interaction even if `onTableIntent` is set.
   */
  intentZoneAllowlist?: readonly string[]
  /**
   * When both `draw` and `discard` exist, set this to show a middle “Pending” column (e.g. Skyjo drawn card).
   */
  pendingStacksColumn?: {
    card: CardInstance | null
    /** Highlights pending column during a multi-step dump & flip flow */
    skyjoDumpStep?: SkyjoDumpUiStep
  }
  /**
   * Highlights the zone whose id is `{zoneIdPrefix}:{playerIndex}` for the current turn
   * (e.g. Skyjo `grid`, Go Fish `hand`). Omit when the game has no per-player turn UI.
   */
  activeTurnHighlight?: ActiveTurnHighlight | null
}

function zoneAllowsIntent(zoneId: string, allowlist: readonly string[] | undefined): boolean {
  return !!allowlist?.length && allowlist.includes(zoneId)
}

function zoneLabel(zone: Zone, humanPlayerIndex: number, getSeatDisplayName?: (i: number) => string): string {
  const other = (i: number) => getSeatDisplayName?.(i) ?? playerSeatLabel(i, humanPlayerIndex)
  if (zone.id === 'skirmish') return 'Table (skirmish)'
  if (zone.id === 'discard') return 'Discard pile'
  if (zone.id === 'stock' || zone.id === 'draw') return 'Draw pile'
  const b = /^books:(\d+)$/.exec(zone.id)
  if (b) {
    const i = Number(b[1])
    return i === humanPlayerIndex ? 'Your books' : `${other(i)}'s books`
  }
  const h = /^hand:(\d+)$/.exec(zone.id)
  if (h) {
    const i = Number(h[1])
    return i === humanPlayerIndex ? 'Your hand' : `${other(i)}'s hand`
  }
  const m = /^pile:(\d+)$/.exec(zone.id)
  if (m) {
    const i = Number(m[1])
    return i === humanPlayerIndex ? 'You' : other(i)
  }
  const s = /^show:(\d+)$/.exec(zone.id)
  if (s) {
    const i = Number(s[1])
    return i === humanPlayerIndex ? 'Your card' : other(i)
  }
  const g = /^grid:(\d+)$/.exec(zone.id)
  if (g) {
    const i = Number(g[1])
    return i === humanPlayerIndex ? 'Your grid (3×4)' : `${other(i)}'s grid`
  }
  return zone.id
}

/** For stacks: show depth indicator; last card is visually on top */
function shouldShowFaceForViewer(
  zone: Zone,
  card: CardInstance,
  _cardIndex: number,
  humanPlayerIndex: number,
): boolean {
  if (!card.faceUp) return false
  if (zone.ownerPlayerIndex !== undefined && zone.ownerPlayerIndex !== humanPlayerIndex) {
    if (zone.id.startsWith('pile:') || zone.id.startsWith('hand:')) return false
  }
  return true
}

type LayoutGroup =
  | { type: 'drawDiscardRow' }
  | { type: 'grids'; ids: string[] }
  | { type: 'single'; id: string }

/** Puts draw+discard on one row when both exist; groups consecutive grid zones for responsive columns. */
function buildLayoutGroups(order: string[], zones: TableState['zones']): LayoutGroup[] {
  const haveDrawDiscard = !!(zones.draw && zones.discard)
  const skipDrawDiscard = new Set<string>()
  if (haveDrawDiscard) {
    skipDrawDiscard.add('draw')
    skipDrawDiscard.add('discard')
  }

  const groups: LayoutGroup[] = []
  if (haveDrawDiscard) {
    groups.push({ type: 'drawDiscardRow' })
  }

  let i = 0
  while (i < order.length) {
    const id = order[i]!
    if (skipDrawDiscard.has(id)) {
      i++
      continue
    }
    if (/^grid:\d+$/.test(id)) {
      const run: string[] = []
      while (i < order.length && /^grid:\d+$/.test(order[i]!)) {
        const zid = order[i]!
        if (!skipDrawDiscard.has(zid)) run.push(zid)
        i++
      }
      if (run.length) groups.push({ type: 'grids', ids: run })
      continue
    }
    groups.push({ type: 'single', id })
    i++
  }
  return groups
}

export function TableView({
  table,
  humanPlayerIndex = 0,
  getSeatDisplayName,
  onTableIntent,
  intentZoneAllowlist,
  pendingStacksColumn,
  activeTurnHighlight,
}: TableViewProps) {
  const order = table.zoneOrder.length ? table.zoneOrder : Object.keys(table.zones)
  const layoutGroups = useMemo(() => buildLayoutGroups(order, table.zones), [order, table.zones])
  const intentsEnabled = typeof onTableIntent === 'function' && !!intentZoneAllowlist?.length

  const emitCard = (zoneId: string, cardIndex: number, e: MouseEvent<HTMLButtonElement>) => {
    if (!intentsEnabled || !zoneAllowsIntent(zoneId, intentZoneAllowlist)) return
    e.preventDefault()
    onTableIntent!({
      kind: 'card',
      zoneId,
      cardIndex,
      modifiers: pointerModifiersFromEvent(e),
    })
  }

  const emitStack = (zoneId: string, e: MouseEvent<HTMLButtonElement>) => {
    if (!intentsEnabled || !zoneAllowsIntent(zoneId, intentZoneAllowlist)) return
    e.preventDefault()
    onTableIntent!({
      kind: 'stack',
      zoneId,
      stackAction: 'top',
      modifiers: pointerModifiersFromEvent(e),
    })
  }

  const emitZone = (zoneId: string, e: MouseEvent<HTMLButtonElement>) => {
    if (!intentsEnabled || !zoneAllowsIntent(zoneId, intentZoneAllowlist)) return
    e.preventDefault()
    onTableIntent!({
      kind: 'zone',
      zoneId,
      modifiers: pointerModifiersFromEvent(e),
    })
  }

  const renderStackCardsInner = (zid: string) => {
    const zone = table.zones[zid]
    if (!zone || zone.kind !== 'stack') return null
    const cards = zone.cards
    const label = zoneLabel(zone, humanPlayerIndex, getSeatDisplayName)
    const zoneInteractive = intentsEnabled && zoneAllowsIntent(zid, intentZoneAllowlist)
    return (
      <>
        {zoneInteractive && cards.length > 0 && (
          <button
            type="button"
            className="tableView__stackHit"
            aria-label={`${label}: use top card / pile`}
            onClick={(e) => emitStack(zid, e)}
          />
        )}
        {cards.map((card, idx) => {
          const showFace = shouldShowFaceForViewer(zone, card, idx, humanPlayerIndex)
          const tmpl = table.templates[card.templateId]
          const inner = <CardView card={card} template={tmpl} showFace={showFace} />
          return (
            <div key={card.instanceId} className="tableView__cardSlot tableView__cardSlot--enter">
              <div
                className="tableView__cardSlotPose"
                style={{
                  zIndex: idx,
                  transform: `translate(${Math.min(idx, 5) * 2}px, ${Math.min(idx, 5) * -1}px)`,
                }}
              >
                {inner}
              </div>
            </div>
          )
        })}
      </>
    )
  }

  const renderZone = (zid: string) => {
    const zone = table.zones[zid]
    if (!zone) return null
    const cards = zone.cards
    const label = zoneLabel(zone, humanPlayerIndex, getSeatDisplayName)
    const zoneInteractive = intentsEnabled && zoneAllowsIntent(zid, intentZoneAllowlist)

    const activeTurn =
      activeTurnHighlight != null && zid === `${activeTurnHighlight.zoneIdPrefix}:${activeTurnHighlight.playerIndex}`

    return (
      <section
        key={zid}
        className={`tableView__zone${zoneInteractive ? ' tableView__zone--interactive' : ''}${zone.kind === 'grid' ? ' tableView__zone--grid' : ''}${activeTurn ? ' tableView__zone--activeTurn' : ''}`}
        data-zone-kind={zone.kind}
        data-zone-id={zid}
        data-active-turn={activeTurn ? 'true' : undefined}
        aria-current={activeTurn ? 'true' : undefined}
      >
        <header className="tableView__zoneTitle">
          <span>{label}</span>
          {zone.kind === 'stack' && cards.length > 0 && (
            <span className="tableView__count">{cards.length} cards</span>
          )}
        </header>
        <div
          className={
            zone.kind === 'grid'
              ? 'tableView__cards tableView__cards--grid'
              : zone.kind === 'spread'
                ? 'tableView__cards tableView__cards--spread'
                : 'tableView__cards tableView__cards--stack'
          }
        >
          {zone.kind === 'stack' ? (
            renderStackCardsInner(zid)
          ) : cards.length === 0 && zone.kind === 'spread' && zoneInteractive ? (
            <button
              type="button"
              className="tableView__spreadEmptyHit"
              aria-label={`${label} — empty`}
              onClick={(e) => emitZone(zid, e)}
            />
          ) : (
            cards.map((card, idx) => {
              const showFace = shouldShowFaceForViewer(zone, card, idx, humanPlayerIndex)
              const tmpl = table.templates[card.templateId]
              const cardInteractive = zoneInteractive && zone.kind !== 'stack'
              const inner = (
                <CardView card={card} template={tmpl} showFace={showFace} presentationOnly={cardInteractive} />
              )
              const poseStyle =
                zone.kind === 'grid'
                  ? undefined
                  : { transform: `rotate(${-12 + idx * 8}deg) translateY(${idx * 2}px)` }
              return (
                <div key={card.instanceId} className="tableView__cardSlot tableView__cardSlot--enter">
                  <div className="tableView__cardSlotPose" style={poseStyle}>
                    {cardInteractive ? (
                      <button
                        type="button"
                        className="tableView__cardHit"
                        aria-label={`${label} card ${idx + 1}`}
                        onClick={(e) => emitCard(zid, idx, e)}
                      >
                        {inner}
                      </button>
                    ) : (
                      inner
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>
    )
  }

  const renderPendingStacksColumn = () => {
    const cfg = pendingStacksColumn
    const c = cfg?.card ?? null
    const tmpl = c ? table.templates[c.templateId] : undefined
    const step = cfg?.skyjoDumpStep ?? 'idle'
    return (
      <div className="tableView__stackCol tableView__stackCol--pending">
        <section
          className={`tableView__zone tableView__zone--pendingSlot${step === 'selectFlip' ? ' tableView__zone--pendingSelectFlip' : ''}`}
          data-skyjo-dump-step={step}
          data-zone-kind="pending"
        >
          <header className="tableView__zoneTitle">
            <span>Pending</span>
          </header>
          <div className="tableView__cards tableView__cards--pendingSlot">
            {c ? (
              <div className="tableView__cardSlot tableView__cardSlot--enter">
                <div className="tableView__cardSlotPose">
                  <CardView card={c} template={tmpl} showFace />
                </div>
              </div>
            ) : (
              <div className="tableView__pendingEmpty">—</div>
            )}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="tableView">
      {layoutGroups.map((g) => {
        if (g.type === 'drawDiscardRow') {
          if (pendingStacksColumn) {
            return (
              <div key="__draw_pending_discard__" className="tableView__stacksRow tableView__stacksRow--tri">
                <div className="tableView__stackCol tableView__stackCol--draw">{renderZone('draw')}</div>
                {renderPendingStacksColumn()}
                <div className="tableView__stackCol tableView__stackCol--discardColumn">
                  <div className="tableView__discardZoneStretch">{renderZone('discard')}</div>
                </div>
              </div>
            )
          }
          return (
            <div key="__draw_discard__" className="tableView__stacksRow">
              {renderZone('draw')}
              {renderZone('discard')}
            </div>
          )
        }
        if (g.type === 'grids') {
          return (
            <div key={g.ids.join('-')} className="tableView__gridsWrap">
              {g.ids.map((zid) => renderZone(zid))}
            </div>
          )
        }
        return <Fragment key={g.id}>{renderZone(g.id)}</Fragment>
      })}
    </div>
  )
}
