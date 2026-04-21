# card-game Terraform (AWS)

Creates:

- S3 bucket + CloudFront distribution for the static site (optional **alternate domain name** + ACM).
- DynamoDB table for room metadata and WebSocket connections (pay-per-request, TTL enabled).
- Two Lambda functions (`http`, `websocket`) behind API Gateway v2 (HTTP API + WebSocket API).
- When **custom domain** is enabled: regional **API Gateway custom domain names** for `https://api.<custom_domain>` and `wss://ws.<custom_domain>/prod`.
- When **custom domain** + **`route53_hosted_zone_id`** are set: **Route 53 alias** records in that zone (apex → CloudFront, `api` / `ws` → API Gateway regional targets).
- IAM role + least-privilege inline policy.

## Inputs you must provide

Either via `terraform.tfvars`, environment variables, or the GitHub deploy workflow
(repository **secrets** supply `TF_VAR_room_jwt_secret` and backend config; see `AWS_SETUP.md`):

- `room_jwt_secret` — any strong random string (e.g. 64 hex chars). Do not commit.
- `http_lambda_zip`, `ws_lambda_zip` — paths to bundles produced by
  `cd lambda && npm run build && npm run bundle` (default paths work when running from this dir).

Optional:

- `custom_domain` + `acm_certificate_arn` for the **site** hostname on CloudFront and (when both are set) for **api.*** / **ws.*** on API Gateway. The certificate must be in **`us-east-1`** for CloudFront; **`aws_region`** should be **`us-east-1`** so the **same** ACM ARN can be attached to API Gateway regional custom domain names.
- `route53_hosted_zone_id` — Route 53 **public** hosted zone **id** (`Z…`) whose **domain name equals `custom_domain`** (e.g. zone `cardgame.example.com` when the site is `https://cardgame.example.com`). When set with a custom domain, Terraform manages DNS records in that zone.
- `allowed_origin` — only if you must override the default (Terraform uses `https://<custom_domain>` for CORS when a custom domain is set, otherwise the CloudFront hostname).
- `site_bucket_name` to pin a particular bucket name.

## Example: `cardgame.michaelj43.dev` (delegated zone in Route 53)

Use a **public hosted zone** for exactly `cardgame.michaelj43.dev` (NS-delegated from your registrar or Cloudflare). The ACM certificate should include at least **`cardgame.michaelj43.dev`** and **`*.cardgame.michaelj43.dev`** so **api.** / **ws.** subdomains are valid for TLS.

### 1. ACM certificate (must be **us-east-1**)

CloudFront only accepts certificates in `us-east-1`. This stack attaches the same ARN to API Gateway when `custom_domain` is set, so keep **`aws_region = "us-east-1"`** unless you maintain a **separate** regional ACM ARN (not implemented as a separate variable today).

1. AWS Console → **Certificate Manager** → **N. Virginia (us-east-1)** → **Request certificate** → **DNS validation**.
2. Add names such as **`cardgame.michaelj43.dev`** and **`*.cardgame.michaelj43.dev`**.
3. Add the validation CNAMEs in the **authoritative** DNS for those names (your delegated Route 53 zone and/or parent zone, depending on ACM’s required record names).
4. Wait until the certificate is **Issued**; copy the **ARN**.

### 2. Terraform / GitHub Actions

The **Deploy** workflow exports optional `TF_VAR_*` only when the corresponding GitHub **Variable** or **Secret** is non-empty (so Terraform still sees `null` when you omit them).

**Variables** — **Settings → Secrets and variables → Actions → Variables**:

| Variable | Example value | Required? |
|----------|----------------|-----------|
| `TF_CUSTOM_DOMAIN` | `cardgame.michaelj43.dev` | For custom hostnames |
| `TF_ALLOWED_ORIGIN` | *(omit unless needed)* | Optional exact CORS / Lambda origin override |

**Secrets** — **Settings → Secrets and variables → Actions → Secrets** (values are masked in the UI and not printed by the workflow):

| Secret | Example value | Required? |
|--------|----------------|-----------|
| `TF_ACM_CERTIFICATE_ARN` | `arn:aws:acm:us-east-1:…:certificate/…` | With `TF_CUSTOM_DOMAIN` |
| `TF_ROUTE53_HOSTED_ZONE_ID` | `Z0ABCDEF123456` | Optional — set to let Terraform create **Route 53** alias records (see below) |

If you previously stored **`TF_ACM_CERTIFICATE_ARN`** or **`TF_ROUTE53_HOSTED_ZONE_ID`** as repository **Variables**, move them to **Secrets** with the same names and delete the old variables so only one binding exists.

**Route 53:** In Route 53 → **Hosted zones** → open the zone whose name is exactly your `TF_CUSTOM_DOMAIN` → copy **Hosted zone ID** into the **`TF_ROUTE53_HOSTED_ZONE_ID`** secret.

Terraform will then:

- Attach the certificate to CloudFront and set the alternate domain name to `cardgame.michaelj43.dev`.
- Create **API Gateway** custom domains **`api.cardgame.michaelj43.dev`** and **`ws.cardgame.michaelj43.dev`** mapped to your HTTP and WebSocket APIs.
- Create **Route 53** alias **A** (and **AAAA** for the apex only) records: apex → CloudFront, `api` → HTTP API regional domain, `ws` → WebSocket API regional domain.
- Set CORS / **`ALLOWED_ORIGIN`** and the HTTP Lambda **`WS_PUBLIC_URL`** to the vanity WebSocket URL when a custom domain is enabled.

If you **omit** the **`TF_ROUTE53_HOSTED_ZONE_ID`** secret, you must still point **DNS** for the apex, **api.**, and **ws.** at CloudFront / API Gateway yourself (same targets Terraform would have used).

**Apex DNS note:** You cannot use a plain **CNAME** at the zone apex. Use **Route 53 alias A/AAAA** to CloudFront (Terraform does this when the zone id is set).

### 3. Multiplayer URLs in the static build

Terraform outputs **`http_api_url`** and **`ws_api_url`** as:

- **`https://api.<custom_domain>`** and **`wss://ws.<custom_domain>/prod`** when a custom domain is enabled, otherwise the default **execute-api** URLs.

The deploy workflow passes those into **`VITE_MULTIPLAYER_*`** unless you override repository **Variables** `VITE_MULTIPLAYER_HTTP_URL` / `VITE_MULTIPLAYER_WS_URL`.

### 4. Smoke test

1. Open `https://cardgame.michaelj43.dev` (TLS + DNS after apply).
2. **Online play** → Host / Join; **Network** tab should show `POST` to `https://api.cardgame…/rooms` (or your custom domain) without CORS errors.

## Remote state

`versions.tf` declares a stubbed `backend "s3" {}` block. Supply backend configuration via
`-backend-config` flags during `terraform init` (the GitHub Actions workflow passes these).

Example manual init:

```bash
terraform init \
  -backend-config=bucket=<your-tfstate-bucket> \
  -backend-config=key=card-game/terraform.tfstate \
  -backend-config=region=us-east-1 \
  -backend-config=dynamodb_table=<your-tfstate-lock-table>
```

## Outputs consumed by the site build

- `http_api_url` → `VITE_MULTIPLAYER_HTTP_URL`
- `ws_api_url` → `VITE_MULTIPLAYER_WS_URL`

The GitHub Actions deploy workflow wires this automatically after `terraform apply`.
