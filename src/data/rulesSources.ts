import { GAME_IDS } from './manifests'

import war from '../rules/war.md?raw'
import demoCustom from '../rules/demo-custom.md?raw'
import goFish from '../rules/go-fish.md?raw'
import skyjo from '../rules/skyjo.md?raw'
import blackjack from '../rules/blackjack.md?raw'
import casinoBlackjack from '../rules/casino-blackjack.md?raw'
import baccarat from '../rules/baccarat.md?raw'
import miniBaccarat from '../rules/mini-baccarat.md?raw'
import crazyEights from '../rules/crazy-eights.md?raw'
import switchGame from '../rules/switch.md?raw'
import pokerDraw from '../rules/poker-draw.md?raw'
import headsUpPoker from '../rules/heads-up-poker.md?raw'
import highCardDuel from '../rules/high-card-duel.md?raw'
import redDog from '../rules/red-dog.md?raw'
import uno from '../rules/uno.md?raw'
import thirtyOne from '../rules/thirty-one.md?raw'
import euchre from '../rules/euchre.md?raw'
import durak from '../rules/durak.md?raw'
import pinochle from '../rules/pinochle.md?raw'
import canasta from '../rules/canasta.md?raw'
import sequenceRace from '../rules/sequence-race.md?raw'

/** In-app rules copy (markdown), one file per selectable game id. */
export const RULES_SOURCES = {
  war,
  'demo-custom': demoCustom,
  'go-fish': goFish,
  skyjo,
  blackjack,
  'casino-blackjack': casinoBlackjack,
  baccarat,
  'mini-baccarat': miniBaccarat,
  'crazy-eights': crazyEights,
  switch: switchGame,
  'poker-draw': pokerDraw,
  'heads-up-poker': headsUpPoker,
  'high-card-duel': highCardDuel,
  'red-dog': redDog,
  uno,
  'thirty-one': thirtyOne,
  euchre,
  durak,
  pinochle,
  canasta,
  'sequence-race': sequenceRace,
} as const satisfies Record<(typeof GAME_IDS)[number], string>

export type RulesGameId = keyof typeof RULES_SOURCES

export function rulesTextForGame(gameId: RulesGameId): string {
  return RULES_SOURCES[gameId]
}
