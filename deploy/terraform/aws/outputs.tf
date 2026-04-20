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
  value       = local.use_custom_domain ? "https://${var.custom_domain}" : "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "http_api_url" {
  description = "HTTP API endpoint (POST /rooms, /rooms/join)."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "ws_api_url" {
  description = "WebSocket API endpoint for signaling."
  value       = "wss://${aws_apigatewayv2_api.ws.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_apigatewayv2_stage.ws.name}"
}

output "rooms_table" {
  description = "DynamoDB rooms table name."
  value       = aws_dynamodb_table.rooms.name
}
