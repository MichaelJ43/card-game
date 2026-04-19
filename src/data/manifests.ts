import standard52 from '../decks/standard-52.yaml?raw'
import exampleCustom from '../decks/example-custom.yaml?raw'
import skyjoDeck from '../decks/skyjo.yaml?raw'
import warYaml from '../games/war/war.yaml?raw'
import demoCustomYaml from '../games/demo-custom/demo-custom.yaml?raw'
import goFishYaml from '../games/go-fish/go-fish.yaml?raw'
import skyjoYaml from '../games/skyjo/skyjo.yaml?raw'
import blackjackYaml from '../games/blackjack/blackjack.yaml?raw'
import casinoBlackjackYaml from '../games/blackjack/casino-blackjack.yaml?raw'
import baccaratYaml from '../games/baccarat/baccarat.yaml?raw'
import miniBaccaratYaml from '../games/baccarat/mini-baccarat.yaml?raw'
import crazyEightsYaml from '../games/crazy-eights/crazy-eights.yaml?raw'
import switchYaml from '../games/crazy-eights/switch.yaml?raw'
import pokerDrawYaml from '../games/poker-draw/poker-draw.yaml?raw'
import headsUpPokerYaml from '../games/poker-draw/heads-up-poker.yaml?raw'
import highCardDuelYaml from '../games/high-card-duel/high-card-duel.yaml?raw'
import redDogYaml from '../games/high-card-duel/red-dog.yaml?raw'
import unoDeck from '../decks/uno.yaml?raw'
import unoYaml from '../games/uno/uno.yaml?raw'

/** Deck id → YAML source (parsed at runtime) */
export const DECK_SOURCES: Record<string, string> = {
  'standard-52': standard52,
  'example-custom': exampleCustom,
  skyjo: skyjoDeck,
  uno: unoDeck,
}

/** Game id → manifest YAML */
export const GAME_SOURCES: Record<string, string> = {
  war: warYaml,
  'demo-custom': demoCustomYaml,
  'go-fish': goFishYaml,
  skyjo: skyjoYaml,
  blackjack: blackjackYaml,
  'casino-blackjack': casinoBlackjackYaml,
  baccarat: baccaratYaml,
  'mini-baccarat': miniBaccaratYaml,
  'crazy-eights': crazyEightsYaml,
  switch: switchYaml,
  'poker-draw': pokerDrawYaml,
  'heads-up-poker': headsUpPokerYaml,
  'high-card-duel': highCardDuelYaml,
  'red-dog': redDogYaml,
  uno: unoYaml,
}

export const GAME_IDS = Object.keys(GAME_SOURCES) as (keyof typeof GAME_SOURCES)[]
