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
  choices: LegalChoiceBrief[]
}): string {
  const lines = input.choices.map((c) => `- index ${c.index}: ${c.label}`)
  return [
    'You are choosing the best move for an AI seat in a card game.',
    `Game id: ${input.gameId}`,
    `Module: ${input.moduleId}`,
    `AI player index: ${input.playerIndex}`,
    `Difficulty flavor: ${input.difficulty}`,
    '',
    'Table digest (lossy, for context only):',
    input.tableDigest.slice(0, 8000),
    '',
    'Legal moves (choose exactly one index from this list):',
    ...lines,
    '',
    'Reply with **only** a single JSON object of the form {"choiceIndex": <number>} where choiceIndex matches one of the listed indices.',
    'Do not add commentary or markdown fences.',
  ].join('\n')
}
