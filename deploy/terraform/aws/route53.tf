# Public DNS in Route 53 when the hosted zone domain equals custom_domain
# (e.g. zone "cardgame.michaelj43.dev" for site https://cardgame.michaelj43.dev).

resource "aws_route53_record" "site_apex_a" {
  count = local.create_route53_records ? 1 : 0

  zone_id = local.route53_zone_id
  name    = ""
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_apex_aaaa" {
  count = local.create_route53_records ? 1 : 0

  zone_id = local.route53_zone_id
  name    = ""
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "http_api_a" {
  count = local.create_route53_records ? 1 : 0

  zone_id = local.route53_zone_id
  name    = "api"
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.http[0].regional_domain_name
    zone_id                = aws_apigatewayv2_domain_name.http[0].regional_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "ws_api_a" {
  count = local.create_route53_records ? 1 : 0

  zone_id = local.route53_zone_id
  name    = "ws"
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.ws[0].regional_domain_name
    zone_id                = aws_apigatewayv2_domain_name.ws[0].regional_hosted_zone_id
    evaluate_target_health = false
  }
}
