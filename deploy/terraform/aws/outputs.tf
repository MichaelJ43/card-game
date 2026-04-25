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
  value       = local.use_custom_domain ? "https://${local.site_hostname}" : "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "http_api_url" {
  description = "HTTP API base URL for VITE_MULTIPLAYER_HTTP_URL: vanity custom hostname when custom domain is enabled, else execute-api URL."
  value       = local.use_api_custom_domains ? "https://${local.http_api_hostname}" : aws_apigatewayv2_api.http.api_endpoint
}

output "ws_api_url" {
  description = "WebSocket URL for VITE_MULTIPLAYER_WS_URL: vanity custom hostname (no path) when custom domain + API mapping bind the stage; default execute-api URL still uses /{stage}."
  value       = local.use_api_custom_domains ? "wss://${local.ws_api_hostname}" : "wss://${aws_apigatewayv2_api.ws.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_apigatewayv2_stage.ws.name}"
}

output "site_hostname" {
  description = "Resolved custom site hostname, if custom domain is enabled."
  value       = local.use_custom_domain ? local.site_hostname : null
}

output "http_api_hostname" {
  description = "Resolved custom HTTP API hostname, if API custom domains are enabled."
  value       = local.use_api_custom_domains ? local.http_api_hostname : null
}

output "ws_api_hostname" {
  description = "Resolved custom WebSocket API hostname, if API custom domains are enabled."
  value       = local.use_api_custom_domains ? local.ws_api_hostname : null
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
  value       = local.turn_stack ? local.turn_hostname : null
}

output "turn_compute_mode" {
  description = "TURN compute mode when TURN is enabled: instance or asg."
  value       = local.turn_stack ? var.turn_compute_mode : null
}

output "turn_asg_name" {
  description = "Auto Scaling Group name for ASG-backed TURN; null otherwise."
  value       = local.turn_asg_stack ? aws_autoscaling_group.turn[0].name : null
}

output "turn_coturn_static_password" {
  description = "Echo of turn_coturn_static_password when TURN stack is on (sensitive). Prefer defining the password only in CI/GitHub secret TURN_COTURN_STATIC_PASSWORD; do not log this output in pipelines."
  value       = local.turn_stack && length(trimspace(var.turn_coturn_static_password)) > 0 ? trimspace(var.turn_coturn_static_password) : null
  sensitive   = true
}
