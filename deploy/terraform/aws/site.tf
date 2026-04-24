locals {
  site_bucket_name = coalesce(var.site_bucket_name, "${local.name}-site-${random_id.suffix.hex}")
}

resource "aws_s3_bucket" "site" {
  bucket        = local.site_bucket_name
  force_destroy = var.site_bucket_force_destroy
  tags          = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${local.name}-oac"
  description                       = "OAC for ${aws_s3_bucket.site.bucket}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

locals {
  custom_domain_host  = var.custom_domain != null ? trimspace(var.custom_domain) : ""
  site_hostname_input = var.site_hostname != null ? trimspace(var.site_hostname) : ""
  site_hostname = coalesce(
    local.site_hostname_input != "" ? local.site_hostname_input : null,
    local.custom_domain_host != "" ? local.custom_domain_host : null,
    "",
  )
  http_api_hostname_input = var.http_api_hostname != null ? trimspace(var.http_api_hostname) : ""
  http_api_hostname = coalesce(
    local.http_api_hostname_input != "" ? local.http_api_hostname_input : null,
    local.site_hostname != "" ? "api.${local.site_hostname}" : null,
    "",
  )
  ws_api_hostname_input = var.ws_api_hostname != null ? trimspace(var.ws_api_hostname) : ""
  ws_api_hostname = coalesce(
    local.ws_api_hostname_input != "" ? local.ws_api_hostname_input : null,
    local.site_hostname != "" ? "ws.${local.site_hostname}" : null,
    "",
  )
  turn_hostname_input = var.turn_hostname != null ? trimspace(var.turn_hostname) : ""
  turn_hostname = coalesce(
    local.turn_hostname_input != "" ? local.turn_hostname_input : null,
    local.site_hostname != "" ? "turn.${local.site_hostname}" : null,
    "",
  )
  use_custom_domain      = local.site_hostname != "" && var.acm_certificate_arn != null && trimspace(var.acm_certificate_arn) != ""
  use_api_custom_domains = local.use_custom_domain && local.http_api_hostname != "" && local.ws_api_hostname != ""
  route53_zone_id        = var.route53_hosted_zone_id != null ? trimspace(var.route53_hosted_zone_id) : ""
  create_route53_records = local.use_api_custom_domains && local.route53_zone_id != ""
  /** Optional coturn EC2 + turn.* DNS + scheduled stop (requires Route 53 on custom domain). */
  turn_stack = var.turn_ec2_enabled && local.create_route53_records && local.turn_hostname != ""
  # Never call trimspace(null): Terraform may evaluate both branches of a ternary / coalesce args.
  allowed_origin_trimmed = var.allowed_origin != null ? trimspace(var.allowed_origin) : ""
  # Browser Origin header for CORS / Lambda: explicit override, else HTTPS custom host, else CloudFront hostname.
  site_browser_origin = coalesce(
    local.allowed_origin_trimmed != "" ? local.allowed_origin_trimmed : null,
    local.use_custom_domain ? "https://${local.site_hostname}" : null,
    "https://${aws_cloudfront_distribution.site.domain_name}",
  )
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${local.name} static site"
  price_class         = "PriceClass_100"

  aliases = local.use_custom_domain ? [local.site_hostname] : []

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "s3-${aws_s3_bucket.site.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${aws_s3_bucket.site.id}"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 300
    max_ttl     = 86400
  }

  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = !local.use_custom_domain
    acm_certificate_arn            = local.use_custom_domain ? var.acm_certificate_arn : null
    ssl_support_method             = local.use_custom_domain ? "sni-only" : null
    minimum_protocol_version       = local.use_custom_domain ? "TLSv1.2_2021" : "TLSv1"
  }

  tags = local.common_tags
}

data "aws_iam_policy_document" "site_bucket" {
  statement {
    sid       = "CloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site_bucket.json
}
