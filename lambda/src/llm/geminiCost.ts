/** Pricing for Gemini 2.5 Flash Lite (Standard text), USD per 1M tokens. */
export const GEMINI_25_FLASH_LITE_USD_PER_M = {
  input: 0.1,
  output: 0.4,
} as const

export function estimateUsdFromUsage(promptTokens: number, completionTokens: number): number {
  const p =
    (promptTokens * GEMINI_25_FLASH_LITE_USD_PER_M.input) / 1e6 +
    (completionTokens * GEMINI_25_FLASH_LITE_USD_PER_M.output) / 1e6
  return Number.isFinite(p) && p >= 0 ? p : 0
}

/** Conservative pre-call estimate using character length heuristic + max output ceiling. */
export function roughEstimateMicroUsdForPrompt(promptText: string, maxOutputTokensAssume = 384): number {
  const guessedPromptTokens = Math.min(32768, Math.ceil(promptText.length / 3))
  const usd = estimateUsdFromUsage(guessedPromptTokens, maxOutputTokensAssume)
  return Math.ceil(usd * 1e6)
}
