resource "aws_cloudwatch_log_group" "http" {
  name              = "/aws/lambda/${local.name}-http"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "ws" {
  name              = "/aws/lambda/${local.name}-ws"
  retention_in_days = 14
  tags              = local.common_tags
}

locals {
  http_lambda_env_turn = local.turn_stack ? {
    TURN_CONTROL_MODE        = var.turn_compute_mode
    TURN_EC2_INSTANCE_ID     = local.turn_instance_stack ? aws_instance.turn[0].id : ""
    TURN_ASG_NAME            = local.turn_asg_stack ? aws_autoscaling_group.turn[0].name : ""
    TURN_ASG_MIN_SIZE        = tostring(var.turn_asg_min_size)
    TURN_ROUTE53_ZONE_ID     = local.route53_zone_id
    TURN_ROUTE53_RECORD_NAME = local.turn_hostname
    WS_MANAGEMENT_API_URL    = "https://${aws_apigatewayv2_api.ws.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_apigatewayv2_stage.ws.name}"
    TURN_MAX_UPTIME_SECONDS  = "14400"
    TURN_USAGE_GRACE_SECONDS = "900"
  } : {}
}

resource "aws_lambda_function" "http" {
  function_name = "${local.name}-http"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs20.x"
  handler       = "http.handler"

  filename         = var.http_lambda_zip
  source_code_hash = filebase64sha256(var.http_lambda_zip)

  memory_size = 256
  timeout     = 10

  environment {
    variables = merge(
      {
        ROOMS_TABLE      = aws_dynamodb_table.rooms.name
        ROOM_JWT_SECRET  = var.room_jwt_secret
        WS_PUBLIC_URL    = local.use_api_custom_domains ? "wss://${local.ws_api_hostname}" : "wss://${aws_apigatewayv2_api.ws.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_apigatewayv2_stage.ws.name}"
        ALLOWED_ORIGIN   = local.site_browser_origin
        ROOM_TTL_SECONDS = tostring(var.room_ttl_seconds)
      },
      local.http_lambda_env_turn,
    )
  }

  depends_on = [aws_cloudwatch_log_group.http]
  tags       = local.common_tags
}

resource "aws_lambda_function" "ws" {
  function_name = "${local.name}-ws"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs20.x"
  handler       = "websocket.handler"

  filename         = var.ws_lambda_zip
  source_code_hash = filebase64sha256(var.ws_lambda_zip)

  memory_size = 256
  timeout     = 10

  environment {
    variables = {
      ROOMS_TABLE               = aws_dynamodb_table.rooms.name
      ROOM_JWT_SECRET           = var.room_jwt_secret
      WS_CONNECTION_TTL_SECONDS = tostring(var.ws_connection_ttl_seconds)
    }
  }

  depends_on = [aws_cloudwatch_log_group.ws]
  tags       = local.common_tags
}
