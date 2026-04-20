/**
 * Second-window chat uses `postMessage` with `window.opener`. Do **not** pass
 * `noopener` in the features string — that severs `opener` in Chromium and the
 * popout cannot talk to the main window.
 *
 * - **Chrome / Edge (Chromium):** `window.open` with a name reuses one tab per name.
 * - **Firefox:** May open a new window each time unless the user allows the site to open popups.
 * - **Safari:** Stricter popup blocking; user gesture (button click) improves success.
 */
export const CHAT_POPOUT_WINDOW_NAME = 'cardgame_room_chat'

export function chatPopoutPageUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  const path = base.endsWith('/') ? `${base}chat-popout.html` : `${base}/chat-popout.html`
  return new URL(path, window.location.origin).href
}

/**
 * Opens the chat popout. Returns `null` if the browser blocked the window.
 * Avoid `noopener` / `noreferrer` so `window.opener` stays usable for messaging.
 */
export function openChatPopoutWindow(): Window | null {
  const url = chatPopoutPageUrl()
  const features = 'width=420,height=560,menubar=no,toolbar=no,location=no,status=no'
  return window.open(url, CHAT_POPOUT_WINDOW_NAME, features)
}
