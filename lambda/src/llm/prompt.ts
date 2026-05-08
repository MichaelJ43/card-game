/** Build a deterministic JSON-ish prompt asking the model to pick a legal action index only. */

export interface LegalChoiceBrief {
  index: number
  label: string
}

export function buildTableAiUserPrompt(input: {
  gameId: string
  moduleId: string
  playerIndex: number
  difficulty: string
  tableDigest: string
  observation: string
  rulesDigest: string
  houseRulesJson: string
  matchJson: string
  moveHistoryJson: string
  heuristicCatalog: string
  choices: LegalChoiceBrief[]
}): string {
  const lines = input.choices.map((c) => `- index ${c.index}: ${c.label}`)
  const obs =
    input.observation.trim().length > 0 ? input.observation : input.tableDigest
  return [
    'You are choosing the best move for an AI seat in a card game.',
    `Game id: ${input.gameId}`,
    `Module: ${input.moduleId}`,
    `AI player index: ${input.playerIndex}`,
    `Difficulty flavor: ${input.difficulty}`,
    '',
    'Rules (trimmed markdown from the app; authoritative text may omit edge cases):',
    input.rulesDigest.slice(0, 12000),
    '',
    'House rules & match options (JSON):',
    input.houseRulesJson.slice(0, 6000),
    '',
    'Match state (JSON, or "null"):',
    input.matchJson.slice(0, 4000),
    '',
    'Recent moves (JSON array: seat, policy human|heuristic|llm, summary):',
    input.moveHistoryJson.slice(0, 8000),
    '',
    'Built-in opponent heuristic notes (extracted from source; may be empty):',
    input.heuristicCatalog.slice(0, 6000),
    '',
    'Role-aware observation for this seat (preferred over raw digest):',
    obs.slice(0, 12000),
    '',
    'Legacy table digest (fallback):',
    input.tableDigest.slice(0, 4000),
    '',
    'Legal moves (choose exactly one index from this list):',
    ...lines,
    '',
    'Reply with **only** a single JSON object of the form {"choiceIndex": <number>} where choiceIndex matches one of the listed indices.',
    'Do not add commentary or markdown fences.',
  ].join('\n')
}
