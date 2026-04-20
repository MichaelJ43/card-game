# card-game Terraform (AWS)

Creates:

- S3 bucket + CloudFront distribution for the static site.
- DynamoDB table for room metadata and WebSocket connections (pay-per-request, TTL enabled).
- Two Lambda functions (`http`, `websocket`) behind API Gateway v2 (HTTP API + WebSocket API).
- IAM role + least-privilege inline policy.

## Inputs you must provide

Either via `terraform.tfvars`, environment variables, or the GitHub deploy workflow:

- `room_jwt_secret` — any strong random string (e.g. 64 hex chars). Do not commit.
- `http_lambda_zip`, `ws_lambda_zip` — paths to bundles produced by
  `cd lambda && npm run build && npm run bundle` (default paths work when running from this dir).

Optional:

- `custom_domain` + `acm_certificate_arn` (must be in `us-east-1`) for a vanity hostname.
- `site_bucket_name` to pin a particular bucket name.

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
