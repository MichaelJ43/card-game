# LLM table AI (Gemini, multi-provider ready)

This document describes the **implemented** cloud “smarter AI” path for **solo / local** tables (not online host/client shells). It is separate from the built-in heuristic `selectAiAction` in each game module.

## Architecture

- **Browser**: optional “Smarter AI” toolbar (Google Sign-In → short-lived backend JWT → `POST /ai/move`).
- **HTTP Lambda** ([`lambda/src/http.ts`](../../lambda/src/http.ts)): routes `GET /ai/capabilities`, `POST /ai/session`, `POST /ai/move` — see [`lambda/src/llm/handlers.ts`](../../lambda/src/llm/handlers.ts).
- **Provider plug-in**: [`lambda/src/llm/providers/types.ts`](../../lambda/src/llm/providers/types.ts) + [`lambda/src/llm/geminiInference.ts`](../../lambda/src/llm/geminiInference.ts). Add new providers by implementing `LlmProvider` and branching in `handlePostAiMove`.
- **Secrets**: Terraform creates **only** the Secrets Manager **container** ([`deploy/terraform/aws/llm.tf`](../../deploy/terraform/aws/llm.tf)); CI runs `aws secretsmanager put-secret-value` so the **API key is not stored in Terraform state**.
- **Spend cap**: estimated USD for **Gemini 2.5 Flash Lite** list pricing is accumulated in the existing DynamoDB rooms table under `pk=METRIC#LLM`, `sk=SPEND#YYYY-MM` (see [`lambda/src/llm/spendTracking.ts`](../../lambda/src/llm/spendTracking.ts)).
- **Metrics**: CloudWatch namespace `CardGame/Llm` via [`lambda/src/llm/metrics.ts`](../../lambda/src/llm/metrics.ts).
- **Client analytics**: `llm_table_inference` events through [`src/analytics/llmTableAnalytics.ts`](../../src/analytics/llmTableAnalytics.ts) (same `M43Analytics.trackPageview` hook as other table events).

## GitHub configuration

| Kind | Name | Purpose |
|------|------|---------|
| **Secret** | `GEMINI_API_KEY` | Gemini Developer API key; written to Secrets Manager by Deploy / Preview workflows (optional). |
| **Variable** | `TF_LLM_MONTHLY_BUDGET_USD` | Passed to Terraform as `llm_monthly_budget_usd`. **`0`** disables LLM. **`-1`** tracks spend but does not block. **`>0`** enforces a soft monthly cap (UTC month, estimated from token usage). |
| **Variable** | `TF_GOOGLE_OAUTH_WEB_CLIENT_IDS` | Comma-separated Google **Web client** IDs; must match the OAuth client used by the site. |
| **Variable** | `VITE_GOOGLE_OAUTH_WEB_CLIENT_ID` | Same client id (or first of several) for `@react-oauth/google` at build time. |

## Google Cloud console

1. Create an OAuth **Web application** client.
2. **Authorized JavaScript origins**: your site origin(s) (e.g. `https://cardgame.example.com`, `http://localhost:5173` for dev).
3. **Authorized redirect URIs**: not required for the GIS button flow used here, but add if Google console demands a placeholder.

## Terraform / Lambda environment

- `GEMINI_SECRET_ARN`, `LLM_MONTHLY_BUDGET_USD`, `GOOGLE_OAUTH_WEB_CLIENT_IDS`, `GEMINI_MODEL_ID` are set on the **HTTP** Lambda ([`deploy/terraform/aws/lambda.tf`](../../deploy/terraform/aws/lambda.tf)).
- Default model id: `gemini-2.5-flash-lite` ([`deploy/terraform/aws/variables.tf`](../../deploy/terraform/aws/variables.tf)).

## Client UI

- [`src/ui/LlmTableAiBar.tsx`](../../src/ui/LlmTableAiBar.tsx) + [`src/ai/tableAiMove.ts`](../../src/ai/tableAiMove.ts) gate LLM usage on sign-in and user opt-in.
- Games included follow [`gameSupportsLlmTableAi`](../../src/session/playerConfig.ts) (same set as per-seat difficulty titles).

## Local development

Without `VITE_MULTIPLAYER_HTTP_URL` / `VITE_GOOGLE_OAUTH_WEB_CLIENT_ID`, the LLM bar is hidden and all AI remains heuristic-only.

```bash
VITE_MULTIPLAYER_HTTP_URL=https://… VITE_GOOGLE_OAUTH_WEB_CLIENT_ID=xxx.apps.googleusercontent.com npm run dev
```

Point the HTTP URL at a stack where `GET /ai/capabilities` returns `llmEnabled: true`.
