import { useCallback, useState } from 'react'

export interface ChatToastItem {
  id: string
  senderLabel: string
  text: string
}

export function useChatToasts(maxVisible = 5, ttlMs = 3000) {
  const [toasts, setToasts] = useState<ChatToastItem[]>([])

  const pushToast = useCallback(
    (item: ChatToastItem) => {
      setToasts((prev) => [...prev, item].slice(-maxVisible))
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id))
      }, ttlMs)
    },
    [maxVisible, ttlMs],
  )

  const clearToasts = useCallback(() => {
    setToasts([])
  }, [])

  return { toasts, pushToast, clearToasts }
}
