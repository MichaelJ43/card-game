const EVENT_LLM = 'llm_table_inference'

function track(eventType: string, context: Record<string, unknown>, path?: string): void {
  const m43 = (globalThis as unknown as { M43Analytics?: { trackPageview?: (p?: unknown) => void } }).M43Analytics
  if (typeof m43?.trackPageview !== 'function') return
  try {
    const p =
      typeof location !== 'undefined'
        ? `${location.pathname}${location.search}`
        : '/'
    m43.trackPageview({
      eventType,
      context,
      path: path ?? p,
    })
  } catch {
    /* ignore */
  }
}

export function trackLlmTableInference(extra: Record<string, unknown>): void {
  track(EVENT_LLM, extra)
}
