# Public DNS in Route 53 for configured custom hostnames.
# The hosted zone must contain the site/API/TURN hostnames.

resource "aws_route53_record" "site_apex_a" {
  count = local.create_route53_records ? 1 : 0

  zone_id = local.route53_zone_id
  name    = local.site_hostname
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
  name    = local.site_hostname
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
  name    = local.http_api_hostname
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.http[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.http[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "ws_api_a" {
  count = local.create_route53_records ? 1 : 0

  zone_id = local.route53_zone_id
  name    = local.ws_api_hostname
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.ws[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.ws[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
