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
| Compute | `aws_lambda_function` **http** / **ws** (+ optional **turn-scheduled**), log groups, IAM role + inline policy (+ optional **turn** inline policy) |
| Optional TURN | When **`turn_ec2_enabled`** and Route 53 are on: coturn **EC2** (default VPC), **`turn.<custom_domain>`** A record (placeholder `127.0.0.1`; **HTTP Lambda** overwrites with public IP after `/turn/start`), EventBridge **15m** → idle-stop Lambda. **No EIP** (avoids EIP hourly charge while instance is stopped). |

**Certificate / region:** CloudFront requires an ACM cert in **`us-east-1`**. API Gateway regional custom domains use the same **`acm_certificate_arn`** in **`var.aws_region`** — use **`aws_region = "us-east-1"`** unless you split certs (not modeled as separate inputs). The cert must cover the site host and **`api.`** / **`ws.`** subdomains if those custom names are used.

**Route 53:** `route53_hosted_zone_id` must refer to a **public** hosted zone whose **zone name equals** `custom_domain` (Terraform creates relative names `""`, `api`, `ws` under that zone). Apex cannot be a plain CNAME; aliases use Route 53 **alias A/AAAA** to CloudFront and **alias A** to API Gateway `domain_name_configuration.target_domain_name` / `hosted_zone_id`.

**Lambda env:** HTTP Lambda `ALLOWED_ORIGIN` / CORS follow `site_browser_origin` in `site.tf` (`allowed_origin` override, else `https://<custom_domain>`, else CloudFront URL). `WS_PUBLIC_URL` uses **`wss://ws.<custom_domain>`** (no path) when a custom domain is enabled—the stage is bound by API mapping; the default execute-api URL still uses **`/{stage}`** (`lambda.tf`).

---

## Inputs

Defined in **`variables.tf`**. Required for any apply: **`room_jwt_secret`**; Lambda zip paths default under `lambda/dist/`.

Notable optional inputs:

- **`custom_domain`**, **`acm_certificate_arn`** — enable CloudFront alternate name + API Gateway custom domains + vanity-oriented outputs.
- **`route53_hosted_zone_id`** — manage the DNS records above (only with custom domain + cert).
- **`allowed_origin`** — override browser origin string for CORS / Lambda when non-empty.
- **`aws_region`**, **`project`**, **`environment`**, **`tags`**, **`site_bucket_name`**, room / connection TTLs, zip paths, **`site_assets_dir`** (used by automation that syncs `dist/`).
- **`turn_ec2_enabled`** (default `false`) — optional coturn stack; requires **`custom_domain`**, **`acm_certificate_arn`**, and **`route53_hosted_zone_id`**. **`turn_instance_type`**, **`scheduled_lambda_zip`**. **GitHub Deploy** does not turn this on unless you set repository **Variable** **`TF_TURN_EC2_ENABLED`**=`true` (workflow exports `TF_VAR_turn_ec2_enabled`); otherwise apply only updates the existing **http** / **ws** Lambdas and APIs—no new EC2 or `turn.*` record.

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
| `ws_api_url` | `wss://ws.<custom_domain>` (no `/stage` path) when custom domain is on; else default **execute-api** `wss://…amazonaws.com/{stage}` |
| `rooms_table` | DynamoDB table name |
| `http_regional_domain_name` | `d-…execute-api…` target for the **HTTP** custom domain (compare to Route 53 `api` alias) |
| `ws_regional_domain_name` | `d-…execute-api…` target for the **WebSocket** custom domain (compare to Route 53 `ws` alias) |
| `turn_hostname` | e.g. `turn.<custom_domain>` when TURN stack is enabled; else `null` |
| `turn_coturn_static_password` | Sensitive coturn password (user **`cardgame`** in user-data); set **`VITE_MULTIPLAYER_TURN_CREDENTIAL`** to match at site build |

**TURN / DNS:** After `terraform apply` with TURN on, run **`terraform output -raw turn_coturn_static_password`** once, configure GitHub Variables **`VITE_MULTIPLAYER_TURN_HOST`** (= `turn_hostname`), **`VITE_MULTIPLAYER_TURN_USER`**=`cardgame`, **`VITE_MULTIPLAYER_TURN_CREDENTIAL`**=that password, then redeploy the site. The HTTP Lambda waits for **EC2 status checks OK** before updating Route 53; the scheduled Lambda stops the instance only after **4h uptime** and **15m** without usage heartbeats (see app).

The site build consumes **`http_api_url`** and **`ws_api_url`** as **`VITE_MULTIPLAYER_HTTP_URL`** / **`VITE_MULTIPLAYER_WS_URL`** when those env vars are not overridden in CI.

If **`wss://ws.<domain>/prod` returns 403** but **`wss://ws.<domain>` connects**, the stage is already set by **API mapping**—use **no path** in the client URL (Terraform outputs match this). If **`wss://ws.<domain>`** still fails, check the **`ws`** Route 53 alias targets **`ws_regional_domain_name`**, not the HTTP API’s regional hostname.

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
