import type { CardInstance, Zone } from '../core/types'

export function shouldShowFaceForViewer(
  _zone: Zone,
  card: CardInstance,
  _cardIndex: number,
  _humanPlayerIndex: number,
): boolean {
  return card.faceUp
}
