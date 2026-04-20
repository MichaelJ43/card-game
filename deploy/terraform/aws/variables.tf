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
  description = "ACM cert ARN in us-east-1 for custom_domain. Required when custom_domain is set."
  type        = string
  default     = null
}

variable "allowed_origin" {
  description = "Allowed browser origin for the HTTP API (defaults to CloudFront distribution)."
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
