variable "project" {
  description = "Short project / resource name prefix."
  type        = string
  default     = "card-game"
}

variable "environment" {
  description = "Deployment environment label (prod, staging, etc.)."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region for the Lambda + API + DynamoDB stack."
  type        = string
  default     = "us-east-1"
}

variable "site_bucket_name" {
  description = "Globally-unique S3 bucket name for the static site. If null, a name is generated."
  type        = string
  default     = null
}

variable "custom_domain" {
  description = "Optional CloudFront alias (e.g. card-game.example.com). Requires acm_certificate_arn."
  type        = string
  default     = null
}

variable "acm_certificate_arn" {
  description = "ACM public cert ARN used for CloudFront (must be in us-east-1) and, when custom_domain is set, for API Gateway custom domains api./ws. (must be in the same region as aws_region — use us-east-1 for both). Must cover custom_domain and api.* / ws.* (e.g. include *.cardgame.example.com)."
  type        = string
  default     = null
}

variable "route53_hosted_zone_id" {
  description = "Optional Route 53 public hosted zone id (e.g. Z…) whose domain name equals custom_domain. When set with custom_domain + acm_certificate_arn, creates alias records: apex → CloudFront, api → HTTP API, ws → WebSocket API."
  type        = string
  default     = null
}

variable "allowed_origin" {
  description = "Override browser Origin for API CORS + Lambda ALLOWED_ORIGIN. Leave null to use https://<custom_domain> when set, else the CloudFront *.cloudfront.net hostname."
  type        = string
  default     = null
}

variable "room_ttl_seconds" {
  description = "Room idle TTL in seconds (Dynamo TTL attribute)."
  type        = number
  default     = 86400
}

variable "ws_connection_ttl_seconds" {
  description = "WebSocket connection row TTL in seconds."
  type        = number
  default     = 7200
}

variable "room_jwt_secret" {
  description = "Signing secret for room JWTs. Provide via TF_VAR_room_jwt_secret or pipeline secret."
  type        = string
  sensitive   = true
}

variable "http_lambda_zip" {
  description = "Path to the packaged http.zip produced by lambda/scripts/bundle.mjs."
  type        = string
  default     = "../../../lambda/dist/http.zip"
}

variable "ws_lambda_zip" {
  description = "Path to the packaged websocket.zip produced by lambda/scripts/bundle.mjs."
  type        = string
  default     = "../../../lambda/dist/websocket.zip"
}

variable "site_assets_dir" {
  description = "Path to the Vite build output (`npm run build` -> dist/). Used by the deploy workflow."
  type        = string
  default     = "../../../dist"
}

variable "tags" {
  description = "Common tags applied to all AWS resources."
  type        = map(string)
  default     = {}
}

variable "turn_ec2_enabled" {
  description = "When true (and custom_domain + Route 53 are configured), provisions a coturn EC2, turn.* A record (placeholder; Lambda updates IP on start), scheduled idle-stop Lambda, and extends HTTP Lambda IAM for EC2/Route53."
  type        = bool
  default     = false
}

variable "turn_coturn_static_password" {
  description = "Long-term coturn credential (username fixed as cardgame in user-data). Required when the TURN EC2 stack applies — use the same value as the site build secret (e.g. GitHub Actions secret TURN_COTURN_STATIC_PASSWORD). Min 8 characters after trim. Leave empty when turn_ec2_enabled is false."
  type        = string
  default     = ""
  sensitive   = true
}

variable "turn_instance_type" {
  description = "Instance type for the optional coturn EC2 (e.g. t3.micro)."
  type        = string
  default     = "t3.micro"
}

variable "scheduled_lambda_zip" {
  description = "Path to turnScheduled.zip from lambda/scripts/bundle.mjs."
  type        = string
  default     = "../../../lambda/dist/turnScheduled.zip"
}
