/** Pointer modifier state for disambiguating actions (e.g. Shift+click). */
export interface PointerModifiers {
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

/** User clicked a specific card slot in a zone. */
export interface TableIntentCard {
  kind: 'card'
  zoneId: string
  /** Index in `zone.cards`. */
  cardIndex: number
  modifiers: PointerModifiers
}

/** User clicked the top of a stack zone (draw / discard). */
export interface TableIntentStack {
  kind: 'stack'
  zoneId: string
  stackAction: 'top'
  modifiers: PointerModifiers
}

/** User clicked an empty spread zone (e.g. opponent with no cards left in hand). */
export interface TableIntentZone {
  kind: 'zone'
  zoneId: string
  modifiers: PointerModifiers
}

export type TableIntent = TableIntentCard | TableIntentStack | TableIntentZone

export function pointerModifiersFromEvent(e: Pick<MouseEvent, 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>): PointerModifiers {
  return {
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
  }
}
