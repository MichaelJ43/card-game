import type { ChatToastItem } from '../chat/useChatToasts'

export function ChatToastStack({ toasts, className = '' }: { toasts: ChatToastItem[]; className?: string }) {
  if (toasts.length === 0) return null
  return (
    <div className={`chatToastStack ${className}`.trim()} role="log" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div key={t.id} className="chatToastStack__item">
          <div className="chatToastStack__sender">{t.senderLabel}</div>
          <div className="chatToastStack__text">{t.text}</div>
        </div>
      ))}
    </div>
  )
}
