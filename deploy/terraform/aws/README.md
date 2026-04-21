# card-game Terraform (AWS)

Creates:

- S3 bucket + CloudFront distribution for the static site.
- DynamoDB table for room metadata and WebSocket connections (pay-per-request, TTL enabled).
- Two Lambda functions (`http`, `websocket`) behind API Gateway v2 (HTTP API + WebSocket API).
- IAM role + least-privilege inline policy.

## Inputs you must provide

Either via `terraform.tfvars`, environment variables, or the GitHub deploy workflow
(repository **secrets** supply `TF_VAR_room_jwt_secret` and backend config; see `AWS_SETUP.md`):

- `room_jwt_secret` — any strong random string (e.g. 64 hex chars). Do not commit.
- `http_lambda_zip`, `ws_lambda_zip` — paths to bundles produced by
  `cd lambda && npm run build && npm run bundle` (default paths work when running from this dir).

Optional:

- `custom_domain` + `acm_certificate_arn` (must be in `us-east-1`) for a vanity hostname.
- `allowed_origin` — only if you must override the default (Terraform uses `https://<custom_domain>` for CORS when a custom domain is set, otherwise the CloudFront hostname).
- `site_bucket_name` to pin a particular bucket name.

## Example: `cardgame.michaelj43.dev` (subdomain only)

Use this when the **apex** `michaelj43.dev` already points elsewhere; only the **subdomain** serves this app.

### 1. ACM certificate (must be **us-east-1**)

CloudFront only accepts certificates in `us-east-1`.

1. AWS Console → **Certificate Manager** → region **N. Virginia (us-east-1)** → **Request certificate**.
2. Choose **Request a public certificate** → fully qualified domain name: **`cardgame.michaelj43.dev`** (DNS validation).
3. In **Route 53** (if your zone is there) click **Create records in Route 53** for the validation CNAMEs.  
   If DNS for `michaelj43.dev` lives at **Cloudflare, Namecheap, etc.**, add the **same** CNAME records there instead.
4. Wait until the certificate status is **Issued** and copy the **ARN** (e.g. `arn:aws:acm:us-east-1:123456789012:certificate/…`).

You do **not** need a separate Route 53 public hosted zone for the subdomain if you already manage `michaelj43.dev` somewhere.

### 2. DNS record for the live site

After the first Terraform apply **with** the custom domain (step 3), CloudFront gives you a distribution domain like `d1111abcdef8.cloudfront.net`.

Create a **DNS record** for `cardgame` → **CNAME** (or an **ALIAS/A** if your DNS provider supports aliasing to CloudFront) pointing to that CloudFront hostname:

| Type | Name / host | Target |
|------|----------------|--------|
| **CNAME** | `cardgame` | `dxxxx.cloudfront.net` (from AWS Console → CloudFront → distribution → domain name) |

TTL: 300s while testing, then longer.

### 3. Terraform / GitHub Actions

The **Deploy** workflow exports optional `TF_VAR_*` only when repository **Variables** are non-empty (so Terraform still sees `null` when you are not using a custom domain).

In GitHub: **Settings → Secrets and variables → Actions → Variables** (repository), add:

| Variable | Example value |
|----------|----------------|
| `TF_CUSTOM_DOMAIN` | `cardgame.michaelj43.dev` |
| `TF_ACM_CERTIFICATE_ARN` | `arn:aws:acm:us-east-1:…:certificate/…` |
| `TF_ALLOWED_ORIGIN` | *(optional)* Only if you need an exact origin string different from `https://cardgame.michaelj43.dev` (e.g. trailing slash quirks). Usually **omit**. |

Then run **Deploy** (push to `main` or **Actions → Deploy → Run workflow**). Terraform will:

- Attach the certificate to CloudFront and set the **alternate domain name** to `cardgame.michaelj43.dev`.
- Set API Gateway CORS and the HTTP Lambda **`ALLOWED_ORIGIN`** to `https://cardgame.michaelj43.dev` automatically when the custom domain is active.

### 4. Multiplayer URLs in the static build

The site bundle still needs the API Gateway URLs. Either:

- Leave **repository Variables** `VITE_MULTIPLAYER_HTTP_URL` / `VITE_MULTIPLAYER_WS_URL` **unset** so each deploy uses the Terraform outputs from that run, or  
- Set them once to stable values from the **Deploy** job summary (recommended if URLs rarely change).

### 5. Smoke test

1. Open `https://cardgame.michaelj43.dev` (TLS should succeed once DNS + cert propagate).
2. **Online play** → Host / Join; browser devtools **Network** tab should show `POST` to your HTTP API without CORS errors (origin = `https://cardgame.michaelj43.dev`).

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

- `http_api_url` → feed into `VITE_MULTIPLAYER_HTTP_URL` when running `npm run build`.
- `ws_api_url` → feed into `VITE_MULTIPLAYER_WS_URL`.

The GitHub Actions deploy workflow wires this automatically.
