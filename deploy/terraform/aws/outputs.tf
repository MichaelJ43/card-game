output "site_bucket" {
  description = "S3 bucket holding the static site."
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution id (use with `aws cloudfront create-invalidation`)."
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain" {
  description = "CloudFront-assigned domain (d*.cloudfront.net)."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "site_url" {
  description = "Public site URL."
  value       = local.use_custom_domain ? "https://${local.custom_domain_host}" : "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "http_api_url" {
  description = "HTTP API base URL for VITE_MULTIPLAYER_HTTP_URL: vanity https://api.<custom_domain> when custom domain is enabled, else execute-api URL."
  value       = local.use_custom_domain ? "https://api.${local.custom_domain_host}" : aws_apigatewayv2_api.http.api_endpoint
}

output "ws_api_url" {
  description = "WebSocket URL for VITE_MULTIPLAYER_WS_URL: vanity wss://ws.<custom_domain> (no path) when custom domain + API mapping bind the stage; default execute-api URL still uses /{stage}."
  value       = local.use_custom_domain ? "wss://ws.${local.custom_domain_host}" : "wss://${aws_apigatewayv2_api.ws.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_apigatewayv2_stage.ws.name}"
}

output "rooms_table" {
  description = "DynamoDB rooms table name."
  value       = aws_dynamodb_table.rooms.name
}

output "http_regional_domain_name" {
  description = "Regional API Gateway hostname for the HTTP custom domain (Route 53 `api` alias target must match exactly)."
  value       = local.use_custom_domain ? aws_apigatewayv2_domain_name.http[0].domain_name_configuration[0].target_domain_name : null
}

output "ws_regional_domain_name" {
  description = "Regional API Gateway hostname for the WebSocket custom domain (Route 53 `ws` alias target must match exactly)."
  value       = local.use_custom_domain ? aws_apigatewayv2_domain_name.ws[0].domain_name_configuration[0].target_domain_name : null
}

output "turn_hostname" {
  description = "FQDN for coturn when turn_ec2_enabled (use as VITE_MULTIPLAYER_TURN_HOST); null otherwise."
  value       = local.turn_stack ? "turn.${local.custom_domain_host}" : null
}

output "turn_coturn_static_password" {
  description = "Static coturn long-term credential password (sensitive). Set VITE_MULTIPLAYER_TURN_CREDENTIAL to match at build time; user is cardgame."
  value       = try(random_password.turn_coturn[0].result, null)
  sensitive   = true
}
