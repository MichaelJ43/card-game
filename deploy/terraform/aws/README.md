# AWS Terraform module (`deploy/terraform/aws`)

Infrastructure-as-code for the **card-game** static site (S3 + CloudFront), **multiplayer** HTTP + WebSocket API Gateway v2 + Lambdas, **DynamoDB** rooms table, and optional **custom TLS hostnames** + **Route 53** aliases.

Human-facing setup and CI are documented in the repository **README**, **`AGENTS.md`**, and (if present locally) **`AWS_SETUP.md`** — not in this file.

---

## Resources (high level)

| Area | Resources |
|------|-----------|
| Site | `aws_s3_bucket.site`, OAC, bucket policy, `aws_cloudfront_distribution.site` |
| APIs | `aws_apigatewayv2_api` (HTTP + WebSocket), integrations, routes, stages, Lambda invoke permissions |
| Custom TLS | When custom hostnames + `acm_certificate_arn` are set: CloudFront **aliases** + viewer cert; `aws_apigatewayv2_domain_name` + `aws_apigatewayv2_api_mapping` for the HTTP and WebSocket API hostnames |
| DNS | When custom hostnames + `acm_certificate_arn` + `route53_hosted_zone_id` are set: site **A/AAAA** → CloudFront; HTTP / WebSocket **A** aliases → API Gateway regional domain targets |
| Data | `aws_dynamodb_table.rooms` (TTL) |
| Compute | `aws_lambda_function` **http** / **ws** (+ optional **turn-scheduled**), log groups, IAM role + inline policy (+ optional **turn** inline policy) |
| Optional TURN | When **`turn_ec2_enabled`** and Route 53 are on: coturn **EC2** (default VPC), the configured TURN A record (placeholder `127.0.0.1`; **HTTP Lambda** overwrites with public IP after `/turn/start`), EventBridge **15m** → idle-stop Lambda. **No EIP** (avoids EIP hourly charge while instance is stopped). |

**Certificate / region:** CloudFront requires an ACM cert in **`us-east-1`**. API Gateway regional custom domains use the same **`acm_certificate_arn`** in **`var.aws_region`** — use **`aws_region = "us-east-1"`** unless you split certs (not modeled as separate inputs). The cert must cover the configured site, HTTP API, WebSocket API, and optional TURN hostnames. PR previews use wildcard sibling names such as `pr-123.cardgame.michaelj43.dev`, `api-pr-123.cardgame.michaelj43.dev`, `ws-pr-123.cardgame.michaelj43.dev`, and `turn-pr-123.cardgame.michaelj43.dev`.

**Route 53:** `route53_hosted_zone_id` must refer to a **public** hosted zone containing the configured hostnames. Apex cannot be a plain CNAME; aliases use Route 53 **alias A/AAAA** to CloudFront and **alias A** to API Gateway `domain_name_configuration.target_domain_name` / `hosted_zone_id`.

**Lambda env:** HTTP Lambda `ALLOWED_ORIGIN` / CORS follow `site_browser_origin` in `site.tf` (`allowed_origin` override, else `https://<site hostname>`, else CloudFront URL). `WS_PUBLIC_URL` uses the configured WebSocket hostname (no path) when a custom domain is enabled—the stage is bound by API mapping; the default execute-api URL still uses **`/{stage}`** (`lambda.tf`).

---

## Inputs

Defined in **`variables.tf`**. Required for any apply: **`room_jwt_secret`**; Lambda zip paths default under `lambda/dist/`.

Notable optional inputs:

- **`custom_domain`**, **`acm_certificate_arn`** — enable CloudFront alternate name + API Gateway custom domains + vanity-oriented outputs.
- **`site_hostname`**, **`http_api_hostname`**, **`ws_api_hostname`**, **`turn_hostname`** — optional explicit hostnames. These default to `custom_domain`, `api.<site hostname>`, `ws.<site hostname>`, and `turn.<site hostname>` for production compatibility, and let PR previews use sibling names such as `api-pr-123...`.
- **`route53_hosted_zone_id`** — manage the DNS records above (only with custom domain + cert).
- **`allowed_origin`** — override browser origin string for CORS / Lambda when non-empty.
- **`aws_region`**, **`project`**, **`environment`**, **`tags`**, **`site_bucket_name`**, **`site_bucket_force_destroy`** (preview teardown only), room / connection TTLs, zip paths, **`site_assets_dir`** (used by automation that syncs `dist/`).
- **`turn_ec2_enabled`** (default `false`) — optional coturn stack; requires configured custom hostnames, **`acm_certificate_arn`**, and **`route53_hosted_zone_id`**. **`turn_instance_type`**, **`scheduled_lambda_zip`**. **GitHub Deploy** exports `TF_VAR_turn_ec2_enabled` when repository **Variable** **`TF_TURN_EC2_ENABLED`** is `true`; otherwise apply only updates the existing **http** / **ws** Lambdas and APIs (no EC2 or TURN record).
- **`turn_coturn_static_password`** (default `""`, sensitive) — **required** when the TURN stack applies: long-term coturn password for user **`cardgame`**. You choose it once (e.g. password generator); pass the same value as GitHub Actions **Secret** **`TURN_COTURN_STATIC_PASSWORD`** so Terraform user-data and the Vite build both use it. Min **8** characters (after trim).

---

## State backend

`versions.tf` declares **`backend "s3" {}`**. Pass **`-backend-config=...`** at `terraform init` (see workflow or local init examples in **`versions.tf`** comments). CI supplies bucket, key, region, and DynamoDB lock table.

---

## Outputs

| Output | Meaning |
|--------|---------|
| `site_bucket` | S3 bucket name for static assets |
| `cloudfront_distribution_id` | For `create-invalidation` |
| `cloudfront_domain` | `*.cloudfront.net` hostname |
| `site_url` | `https://<custom_domain>` when configured, else `https://<cloudfront_domain>` |
| `http_api_url` | `https://<http_api_hostname>` when custom domain is on, else HTTP API `api_endpoint` |
| `ws_api_url` | `wss://<ws_api_hostname>` (no `/stage` path) when custom domain is on; else default **execute-api** `wss://…amazonaws.com/{stage}` |
| `site_hostname` | Resolved custom site hostname when custom domain is on |
| `http_api_hostname` | Resolved custom HTTP API hostname when custom domain is on |
| `ws_api_hostname` | Resolved custom WebSocket API hostname when custom domain is on |
| `rooms_table` | DynamoDB table name |
| `http_regional_domain_name` | `d-…execute-api…` target for the **HTTP** custom domain (compare to Route 53 `api` alias) |
| `ws_regional_domain_name` | `d-…execute-api…` target for the **WebSocket** custom domain (compare to Route 53 `ws` alias) |
| `turn_hostname` | e.g. `turn.<custom_domain>` when TURN stack is enabled; else `null` |
| `turn_coturn_static_password` | Sensitive echo of the configured coturn password when TURN is on (avoid printing in CI); user **`cardgame`** in user-data |

**TURN / DNS:** There is **no** `VITE_MULTIPLAYER_TURN_URL` — WebRTC uses a `turn:` URL, which the app builds from the host. **One password, one secret:** create a strong password (min 8 characters), store it as GitHub Actions **Secret** **`TURN_COTURN_STATIC_PASSWORD`**. The **Deploy** workflow passes it to Terraform as **`TF_VAR_turn_coturn_static_password`** (coturn on EC2) and to Vite as **`VITE_MULTIPLAYER_TURN_CREDENTIAL`**, so you do not copy values out of `terraform output` after each apply.

| GitHub Actions | Value |
|----------------|--------|
| **Secret** `TURN_COTURN_STATIC_PASSWORD` | Your chosen coturn password (same value for Terraform + browser bundle). |
| **Variable** `VITE_MULTIPLAYER_TURN_HOST` | Hostname only, e.g. `turn.cardgame.michaelj43.dev` (same as `terraform output -raw turn_hostname`). **Do not** use `https://` or a path. |
| **Variable** `VITE_MULTIPLAYER_TURN_USER` | `cardgame` (matches Terraform user-data). |

If you previously used **`VITE_MULTIPLAYER_TURN_CREDENTIAL`** as a separate Actions secret, remove it and use **`TURN_COTURN_STATIC_PASSWORD`** only (both Terraform and Vite read that name in deploy).

**Why a Secret?** The password must exist in **two** places: EC2 user-data (via Terraform) and the static site (via Vite). CI supplies one GitHub **Secret** to both steps. It still ends up in client JS for anyone who inspects the bundle; **short-lived / on-demand credentials** (e.g. TURN REST API) remain a future improvement for stricter threat models.

**Migrating from older Terraform that used `random_password`:** the coturn instance **user-data** changes; Terraform will typically **replace** the EC2 instance once. Put the password you want to keep (or a new one) in **`TURN_COTURN_STATIC_PASSWORD`** before apply.

**Credential shape (practical limits):**

| Topic | Notes |
|--------|--------|
| **Minimum length** | **8** characters after trim — enforced by Terraform `precondition`. |
| **Maximum length** | No extra cap in this repo; stay within normal GitHub Secret size and EC2 user-data limits (multi‑KB script budget — very long passphrases are fine). |
| **Characters** | Use a **single line** (no newlines). User-data uses a **quoted** heredoc so **dollar, backtick, and backslash** in the password are not interpreted by bash. Prefer **printable ASCII** for least surprise in coturn, the browser, and GitHub Secrets; leading/trailing spaces are trimmed by Terraform. |
| **`:` in password** | coturn’s `user=name:secret` line treats the **first** `:` as the split between username and password, so a password may contain **additional** colons. |
| **`#` in password** | Should be OK in the middle of a `user=` line in `turnserver.conf` (comments are line-oriented); if you hit parse issues, avoid `#` at the start of the password. |

Then redeploy the site. The HTTP Lambda waits for **EC2 status checks OK** before updating Route 53; the scheduled Lambda stops the instance only after **4h uptime** and **15m** without usage heartbeats (see app).

The site build consumes **`http_api_url`** and **`ws_api_url`** as **`VITE_MULTIPLAYER_HTTP_URL`** / **`VITE_MULTIPLAYER_WS_URL`** when those env vars are not overridden in CI.

If **`wss://ws.<domain>/prod` returns 403** but **`wss://ws.<domain>` connects**, the stage is already set by **API mapping**—use **no path** in the client URL (Terraform outputs match this). If **`wss://ws.<domain>`** still fails, check the **`ws`** Route 53 alias targets **`ws_regional_domain_name`**, not the HTTP API’s regional hostname.

---

## PR previews

`.github/workflows/preview.yml` creates a full temporary environment for each same-repository PR and destroys it when the PR closes. Each preview uses its own S3 backend key:

```bash
card-game/previews/pr-<number>/terraform.tfstate
```

Preview hostnames are:

| Endpoint | Hostname |
|----------|----------|
| Site | `pr-<number>.cardgame.michaelj43.dev` |
| HTTP API | `api-pr-<number>.cardgame.michaelj43.dev` |
| WebSocket API | `ws-pr-<number>.cardgame.michaelj43.dev` |
| Optional TURN | `turn-pr-<number>.cardgame.michaelj43.dev` |

The preview workflow reuses the production AWS secrets (`AWS_ROLE_ARN`, `AWS_REGION`, `TF_STATE_BUCKET`, `TF_STATE_LOCK_TABLE`, `ROOM_JWT_SECRET`, `TF_ACM_CERTIFICATE_ARN`, `TF_ROUTE53_HOSTED_ZONE_ID`). The ACM certificate must cover `*.cardgame.michaelj43.dev`. Per-PR TURN EC2 is controlled by repository Variable `TF_PREVIEW_TURN_EC2_ENABLED`; leave it `false` to avoid preview EC2 cost.

On PR close, the workflow runs `terraform destroy` with the same state key and variables, then removes the preview state object from S3. `site_bucket_force_destroy` is set for previews so the temporary S3 bucket can be deleted after assets have been uploaded.

---

## Source layout

| File | Role |
|------|------|
| `main.tf` | Naming, tags, `random_id` |
| `versions.tf` | Terraform / provider versions; default **`aws`** provider in `var.aws_region`; aliased **`aws.us_east_1`** (currently unused by resources — cert is passed by ARN) |
| `variables.tf` | Input variables |
| `outputs.tf` | Outputs |
| `site.tf` | S3 site bucket, OAC, CloudFront, locals for custom domain / browser origin / Route 53 flags |
| `route53.tf` | Conditional Route 53 alias records |
| `apigateway.tf` | HTTP + WebSocket APIs, optional custom domain names + mappings |
| `lambda.tf` | Lambdas, env, log groups |
| `iam.tf` | Execution role + policies |
| `dynamodb.tf` | Rooms table |
| `turn.tf` | Optional coturn EC2, SG, Route 53 `turn` A, IAM for EC2/R53, scheduled Lambda + EventBridge |
