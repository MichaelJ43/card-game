export function parseChoiceIndexFromModelText(text: string, maxExclusive: number): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  let jsonStr = trimmed
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) jsonStr = fence[1].trim()

  try {
    const v = JSON.parse(jsonStr) as unknown
    if (!v || typeof v !== 'object') return null
    const idx = (v as { choiceIndex?: unknown }).choiceIndex
    if (typeof idx !== 'number' || !Number.isInteger(idx)) return null
    if (idx < 0 || idx >= maxExclusive) return null
    return idx
  } catch {
    return null
  }
}
