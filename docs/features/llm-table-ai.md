# LLM table AI (Gemini, multi-provider ready)

This document describes the **implemented** cloud “smarter AI” path for **solo / local** tables (not online host/client shells). It is separate from the built-in heuristic `selectAiAction` in each game module.

**Behavior, prompt fields, move ledger, and per-game hooks** are documented in [table-ai-llm.md](table-ai-llm.md). **Card motion** when the table updates is documented in [table-card-motion.md](table-card-motion.md).

## Architecture

- **Browser**: the “Smarter AI” toolbar is shown **only when** the viewer has a valid **shared platform auth session** (`sap_session` HttpOnly cookie, see [shared-api-platform `docs/auth-and-dashboard.md`](https://github.com/MichaelJ43/shared-api-platform/blob/main/docs/auth-and-dashboard.md)). The SPA calls card-game **`GET /ai/capabilities`** and **`POST /ai/session`** with **`credentials: 'include'`** so that cookie reaches the card-game HTTP API.
- **HTTP Lambda** ([`lambda/src/http.ts`](../../lambda/src/http.ts)): routes `GET /ai/capabilities`, `POST /ai/session`, `POST /ai/move` — see [`lambda/src/llm/handlers.ts`](../../lambda/src/llm/handlers.ts).
- **Session verification**: Lambda forwards the inbound `Cookie` header to shared-api-platform **`GET {AUTH_PLATFORM_API_BASE}/v1/auth/me`** ([`lambda/src/llm/sapAuth.ts`](../../lambda/src/llm/sapAuth.ts)). On **200**, the returned `user.id` becomes the **subject** of a short-lived card-game LLM Bearer JWT (`POST /ai/session`). **`POST /ai/move`** requires that Bearer **and** a live **`/v1/auth/me`** success with the **same `user.id`** (so logging out invalidates Gemini calls immediately).
- **Provider plug-in**: [`lambda/src/llm/providers/types.ts`](../../lambda/src/llm/providers/types.ts) + [`lambda/src/llm/geminiInference.ts`](../../lambda/src/llm/geminiInference.ts). Add new providers by implementing `LlmProvider` and branching in `handlePostAiMove`.
- **Secrets**: Terraform creates **only** the Secrets Manager **container** ([`deploy/terraform/aws/llm.tf`](../../deploy/terraform/aws/llm.tf)); CI runs `aws secretsmanager put-secret-value` so the **API key is not stored in Terraform state**.
- **Spend cap**: estimated USD for **Gemini 2.5 Flash Lite** list pricing is accumulated in the existing DynamoDB rooms table under `pk=METRIC#LLM`, `sk=SPEND#YYYY-MM` (see [`lambda/src/llm/spendTracking.ts`](../../lambda/src/llm/spendTracking.ts)).
- **Metrics**: CloudWatch namespace `CardGame/Llm` via [`lambda/src/llm/metrics.ts`](../../lambda/src/llm/metrics.ts).
- **Client analytics**: `llm_table_inference` events through [`src/analytics/llmTableAnalytics.ts`](../../src/analytics/llmTableAnalytics.ts) (same `M43Analytics.trackPageview` hook as other table events).

### Cookie / CORS prerequisites

`GET /ai/capabilities` and **`POST`** routes use **`Access-Control-Allow-Credentials: true`** with a concrete **`Access-Control-Allow-Origin`** (site origin from Terraform `allowed_origin`). The API Gateway CORS definition allows the **`cookie`** request header ([`deploy/terraform/aws/apigateway.tf`](../../deploy/terraform/aws/apigateway.tf)).

The **`sap_session`** cookie is scoped to **`Domain=<apex>`** of shared-api-platform **`CORS_ALLOWED_BASE_HOST`** (e.g. `michaelj43.dev`), so `*.michaelj43.dev` origins and the card-game API hostname under the same registrable domain both receive it when **`fetch(..., { credentials: 'include' })`** is used.

## GitHub configuration

| Kind | Name | Purpose |
|------|------|---------|
| **Secret** | `GEMINI_API_KEY` | Gemini Developer API key; written to Secrets Manager by Deploy / Preview workflows (optional). |
| **Variable** | `TF_LLM_MONTHLY_BUDGET_USD` | Passed to Terraform as `llm_monthly_budget_usd`. **`0`** disables LLM. **`-1`** tracks spend but does not block. **`>0`** enforces a soft monthly cap (UTC month, estimated from token usage). |
| **Variable** | `TF_AUTH_PLATFORM_API_BASE` | Optional override for **`auth_platform_api_base`** (Terraform). Default **`https://api.michaelj43.dev`**. Lambda calls **`GET`** `{base}/v1/auth/me` with forwarded cookies. |

## Terraform / Lambda environment

- `GEMINI_SECRET_ARN`, `LLM_MONTHLY_BUDGET_USD`, `AUTH_PLATFORM_API_BASE`, `GEMINI_MODEL_ID` on the **HTTP** Lambda ([`deploy/terraform/aws/lambda.tf`](../../deploy/terraform/aws/lambda.tf)).
- Default model id: `gemini-2.5-flash-lite` ([`deploy/terraform/aws/variables.tf`](../../deploy/terraform/aws/variables.tf)).

## Client UI

- [`src/ui/LlmTableAiBar.tsx`](../../src/ui/LlmTableAiBar.tsx) + [`src/ai/tableAiMove.ts`](../../src/ai/tableAiMove.ts): toolbar only when **`authSessionValid`** from capabilities; obtains LLM Bearer via **`POST /ai/session`** after sign-in elsewhere (e.g. [auth SPA](https://auth.michaelj43.dev)).
- Games included follow [`gameSupportsLlmTableAi`](../../src/session/playerConfig.ts) (same set as per-seat difficulty titles).

## Local development

Without `VITE_MULTIPLAYER_HTTP_URL`, LLM endpoints are unreachable and AI stays heuristic-only. To exercise LLM flows you need:

1. **`VITE_MULTIPLAYER_HTTP_URL`** pointing at a deployed card-game HTTP API (with Gemini secret + budget not `0`).
2. **Valid `sap_session`**: typically sign in via the auth SPA (`https://auth.michaelj43.dev` prod, or local stack equivalent), served from **the same apex domain** behavior as prod so the cookie reaches your API when using **`npm run dev`** with an appropriate origin (often **HTTPS localhost** tunnel or staging hostname).

```bash
VITE_MULTIPLAYER_HTTP_URL=https://… npm run dev
```

`GET /ai/capabilities` should return **`authSessionValid: true`** and **`llmEnabled: true`** when the cookie validates and Gemini is wired.
