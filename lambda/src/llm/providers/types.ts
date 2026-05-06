export type LlmProviderId = 'gemini'

export interface LlmInferenceInput {
  userPrompt: string
  temperature?: number
  maxOutputTokens?: number
}

export interface LlmInferenceResult {
  text: string
  promptTokenCount?: number
  completionTokenCount?: number
}

export interface LlmProvider {
  readonly id: LlmProviderId
  infer(input: LlmInferenceInput): Promise<LlmInferenceResult>
}
