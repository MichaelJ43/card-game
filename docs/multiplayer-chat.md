# Online room chat

When **online multiplayer** is enabled in the build, hosts and joined clients can use **in-room text chat** alongside the table. Chat is **ephemeral**: the host keeps messages in memory only for the life of the WebRTC session; nothing is written to the signaling server or DynamoDB.

## How to use it

1. **Host a room** or **join** with a room code (same flow as normal online play).
2. Click **Open chat**. The browser opens a **second window** with a short transcript and a composer.
3. Type a message and press **Send** or **Enter**. Everyone in the room sees the line (after the host validates it).

If the chat window is **closed**, new messages still appear as **toasts** in the bottom-right of the **main** game window (up to **five** at a time, each for about **three seconds**). While the chat popout is **open**, new lines appear **only** in the transcript there (no duplicate toasts in the popout).

## Names and limits

- The sender label is the same **seat display name** used on the table (from seat profiles / defaults). Renaming via the inline **Name** field in the multiplayer strip updates future chat lines after you save.
- Message bodies are trimmed, control characters removed, and capped at **140** characters (`sanitizeChatText` in `src/net/protocol.ts`).
- The host applies a simple **rate limit** (per seat) so a buggy client cannot flood the channel.

## Wire protocol

Chat reuses the existing **game** DataChannel between host and clients:

- **Client → host:** `PeerClientChatSend` (`type: 'chatSend'`, `seat`, `text`).
- **Host → all clients:** `PeerHostChatLine` (`type: 'chatLine'`, `id`, `seat`, `senderLabel`, `text`, `ts`).

These types are part of the `PeerMessage` union in `src/net/protocol.ts`. A protocol bump ships with the feature (`PROTOCOL_VERSION`).

## Popout window and `postMessage`

The chat UI is a **separate Vite HTML entry** (`chat-popout.html` → `src/chat-popout/main.tsx`). The main app and the popout exchange messages with a shared `source` tag (`CHAT_POPOUT_MESSAGE_SOURCE` in `src/chat/chatPopoutMessages.ts`):

- **Popout → main:** `chat-popout-ready` (main responds with a full `chat-sync`), `chat-outgoing` (user sent text).
- **Main → popout:** `chat-sync` (initial history), `chat-line` (one new line).

**Do not** open the chat window with `noopener`, or `window.opener` may be null and the popout cannot receive history or send messages. Popup blockers may return `null` from `window.open`; the multiplayer strip shows a short error in that case.

## Code map

| Area | Files |
|------|--------|
| Types + sanitization | `src/net/protocol.ts` |
| Host broadcast / client receive | `src/net/host.ts`, `src/net/client.ts` |
| Main app state, popout bridge, toasts | `src/App.tsx`, `src/chat/useChatToasts.ts`, `src/ui/ChatToastStack.tsx` |
| Open URL / window name | `src/ui/openChatPopout.ts` |
| Popout UI | `chat-popout.html`, `src/chat-popout/main.tsx`, `src/chat-popout/chat-popout.css` |
| Build (second page) | `vite.config.ts` |
| Shell controls | `src/ui/MultiplayerPanel.tsx`, `src/App.css`, `docs/ui-design.md` |
