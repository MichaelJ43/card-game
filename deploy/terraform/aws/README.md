# AWS Terraform module (`deploy/terraform/aws`)

Infrastructure-as-code for the **card-game** static site (S3 + CloudFront), **multiplayer** HTTP + WebSocket API Gateway v2 + Lambdas, **DynamoDB** rooms table, and optional **custom TLS hostnames** + **Route 53** aliases.

Human-facing setup and CI are documented in the repository **README**, **`AGENTS.md`**, and (if present locally) **`AWS_SETUP.md`** — not in this file.

---

## Resources (high level)

| Area | Resources |
|------|-----------|
| Site | `aws_s3_bucket.site`, OAC, bucket policy, `aws_cloudfront_distribution.site` |
| APIs | `aws_apigatewayv2_api` (HTTP + WebSocket), integrations, routes, stages, Lambda invoke permissions |
| Custom TLS | When `custom_domain` + `acm_certificate_arn` are set: CloudFront **aliases** + viewer cert; `aws_apigatewayv2_domain_name` + `aws_apigatewayv2_api_mapping` for `api.<custom_domain>` and `ws.<custom_domain>` |
| DNS | When `custom_domain` + `acm_certificate_arn` + `route53_hosted_zone_id` are set: `aws_route53_record` apex **A/AAAA** → CloudFront; `api` / `ws` **A** aliases → API Gateway regional domain targets |
| Data | `aws_dynamodb_table.rooms` (TTL) |
| Compute | `aws_lambda_function` **http** / **ws**, log groups, IAM role + inline policy |

**Certificate / region:** CloudFront requires an ACM cert in **`us-east-1`**. API Gateway regional custom domains use the same **`acm_certificate_arn`** in **`var.aws_region`** — use **`aws_region = "us-east-1"`** unless you split certs (not modeled as separate inputs). The cert must cover the site host and **`api.`** / **`ws.`** subdomains if those custom names are used.

**Route 53:** `route53_hosted_zone_id` must refer to a **public** hosted zone whose **zone name equals** `custom_domain` (Terraform creates relative names `""`, `api`, `ws` under that zone). Apex cannot be a plain CNAME; aliases use Route 53 **alias A/AAAA** to CloudFront and **alias A** to API Gateway `domain_name_configuration.target_domain_name` / `hosted_zone_id`.

**Lambda env:** HTTP Lambda `ALLOWED_ORIGIN` / CORS follow `site_browser_origin` in `site.tf` (`allowed_origin` override, else `https://<custom_domain>`, else CloudFront URL). `WS_PUBLIC_URL` switches to the vanity **`wss://ws.<custom_domain>/<ws_stage>`** when a custom domain is enabled (`lambda.tf`).

---

## Inputs

Defined in **`variables.tf`**. Required for any apply: **`room_jwt_secret`**; Lambda zip paths default under `lambda/dist/`.

Notable optional inputs:

- **`custom_domain`**, **`acm_certificate_arn`** — enable CloudFront alternate name + API Gateway custom domains + vanity-oriented outputs.
- **`route53_hosted_zone_id`** — manage the DNS records above (only with custom domain + cert).
- **`allowed_origin`** — override browser origin string for CORS / Lambda when non-empty.
- **`aws_region`**, **`project`**, **`environment`**, **`tags`**, **`site_bucket_name`**, room / connection TTLs, zip paths, **`site_assets_dir`** (used by automation that syncs `dist/`).

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
| `http_api_url` | `https://api.<custom_domain>` when custom domain is on, else HTTP API `api_endpoint` |
| `ws_api_url` | `wss://ws.<custom_domain>/<stage>` when custom domain is on, else default **execute-api** WebSocket URL |
| `rooms_table` | DynamoDB table name |
| `http_regional_domain_name` | `d-…execute-api…` target for the **HTTP** custom domain (compare to Route 53 `api` alias) |
| `ws_regional_domain_name` | `d-…execute-api…` target for the **WebSocket** custom domain (compare to Route 53 `ws` alias) |

The site build consumes **`http_api_url`** and **`ws_api_url`** as **`VITE_MULTIPLAYER_HTTP_URL`** / **`VITE_MULTIPLAYER_WS_URL`** when those env vars are not overridden in CI.

If **`wss://ws.<domain>/…` returns 403** but **`wss://<api-id>.execute-api…/…` works**, the **`ws`** Route 53 alias likely points at the **HTTP** API’s regional hostname (or vice versa): **`ws`** must alias only to **`ws_regional_domain_name`**, not **`http_regional_domain_name`**.

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
