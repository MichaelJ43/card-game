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
    variables = {
      ROOMS_TABLE      = aws_dynamodb_table.rooms.name
      ROOM_JWT_SECRET  = var.room_jwt_secret
      WS_PUBLIC_URL    = "wss://${aws_apigatewayv2_api.ws.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_apigatewayv2_stage.ws.name}"
      ALLOWED_ORIGIN   = local.site_browser_origin
      ROOM_TTL_SECONDS = tostring(var.room_ttl_seconds)
    }
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
      ROOMS_TABLE              = aws_dynamodb_table.rooms.name
      ROOM_JWT_SECRET          = var.room_jwt_secret
      WS_CONNECTION_TTL_SECONDS = tostring(var.ws_connection_ttl_seconds)
    }
  }

  depends_on = [aws_cloudwatch_log_group.ws]
  tags       = local.common_tags
}
