import type { LlmInferenceInput, LlmInferenceResult, LlmProvider } from './providers/types'

function extractTextFromGeminiGenerateContent(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const c = body as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const parts = c.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim()
}

export function classifyGeminiHttpError(body: unknown): string {
  try {
    const b = body as {
      error?: { message?: string; status?: string; code?: number }
    }
    const msg = typeof b?.error?.message === 'string' ? b.error.message : ''
    const code = typeof b?.error?.code === 'number' ? b.error.code : 0
    const lower = `${msg} ${code}`.toLowerCase()
    if (lower.includes('quota') || lower.includes('billing')) {
      return 'BILLING_OR_QUOTA'
    }
    if (lower.includes('resource_exhausted') || lower.includes('resource exhausted')) {
      return 'RESOURCE_EXHAUSTED'
    }
    if (
      lower.includes('permission_denied') ||
      lower.includes('api key invalid') ||
      lower.includes('api_key_invalid')
    ) {
      return 'AUTH'
    }
    return 'UNKNOWN'
  } catch {
    return 'UNKNOWN'
  }
}

export function createGeminiProvider(apiKey: string, modelId: string): LlmProvider {
  return {
    id: 'gemini',
    async infer(input: LlmInferenceInput): Promise<LlmInferenceResult> {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: input.userPrompt }] }],
          generationConfig: {
            temperature: input.temperature ?? 0.25,
            maxOutputTokens: input.maxOutputTokens ?? 128,
            responseMimeType: 'application/json',
          },
        }),
      })

      const json = (await res.json()) as Record<string, unknown>
      if (!res.ok) {
        const cls = classifyGeminiHttpError(json)
        const err = new Error(
          `${cls}: ${typeof (json.error as { message?: unknown })?.message === 'string' ? (json.error as { message: string }).message : res.status}`,
        )
        ;(err as { code?: string }).code = cls
        ;(err as { httpStatus?: number }).httpStatus = res.status
        throw err
      }

      const text = extractTextFromGeminiGenerateContent(json)
      const um = (json.usageMetadata ?? {}) as {
        promptTokenCount?: number
        candidatesTokenCount?: number
      }
      return {
        text,
        promptTokenCount: typeof um.promptTokenCount === 'number' ? um.promptTokenCount : undefined,
        completionTokenCount:
          typeof um.candidatesTokenCount === 'number' ? um.candidatesTokenCount : undefined,
      }
    },
  }
}
