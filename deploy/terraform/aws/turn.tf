# Optional coturn EC2 + turn.<custom_domain> A record + EventBridge idle scheduler.
# Requires: custom_domain, Route 53 zone, turn_ec2_enabled = true.

data "aws_vpc" "default" {
  count   = local.turn_stack ? 1 : 0
  default = true
}

data "aws_subnets" "default" {
  count = local.turn_stack ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default[0].id]
  }
}

data "aws_ami" "al2023_x86" {
  count       = local.turn_stack ? 1 : 0
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-202*-kernel-6.1-x86_64"]
  }
}

resource "random_password" "turn_coturn" {
  count   = local.turn_stack ? 1 : 0
  length  = 24
  special = false
}

resource "aws_security_group" "turn" {
  count       = local.turn_stack ? 1 : 0
  name        = "${local.name}-coturn"
  description = "coturn STUN/TURN for card-game multiplayer"
  vpc_id      = data.aws_vpc.default[0].id

  ingress {
    description = "TURN/STUN"
    from_port   = 3478
    to_port     = 3478
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "TURN/STUN TCP"
    from_port   = 3478
    to_port     = 3478
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "TURN relay UDP range"
    from_port   = 49152
    to_port     = 65535
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { CARDGAME_TURN_LINK = "coturn" })
}

resource "aws_instance" "turn" {
  count                       = local.turn_stack ? 1 : 0
  ami                         = data.aws_ami.al2023_x86[0].id
  instance_type               = var.turn_instance_type
  subnet_id                   = sort(tolist(data.aws_subnets.default[0].ids))[0]
  vpc_security_group_ids      = [aws_security_group.turn[0].id]
  associate_public_ip_address = true

  user_data = base64encode(templatefile("${path.module}/turn-user-data.sh.tpl", {
    realm         = local.custom_domain_host
    turn_user     = "cardgame"
    turn_password = random_password.turn_coturn[0].result
  }))

  metadata_options {
    http_tokens = "required"
  }

  tags = merge(local.common_tags, {
    Name               = "${local.name}-coturn"
    CARDGAME_TURN_LINK = "coturn"
  })
}

# Placeholder A; Lambda overwrites with live public IP on /turn/start (ignore drift).
resource "aws_route53_record" "turn_a" {
  count   = local.turn_stack ? 1 : 0
  zone_id = local.route53_zone_id
  name    = "turn"
  type    = "A"
  ttl     = 60
  records = ["127.0.0.1"]

  lifecycle {
    ignore_changes = [records]
  }
}

data "aws_iam_policy_document" "lambda_turn" {
  count = local.turn_stack ? 1 : 0
  statement {
    sid = "TurnEc2"
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeInstanceStatus",
      "ec2:StartInstances",
      "ec2:StopInstances",
    ]
    resources = [aws_instance.turn[0].arn]
  }
  statement {
    sid       = "TurnRoute53"
    actions   = ["route53:ChangeResourceRecordSets"]
    resources = ["arn:aws:route53:::hostedzone/${local.route53_zone_id}"]
  }
}

resource "aws_iam_role_policy" "lambda_turn" {
  count  = local.turn_stack ? 1 : 0
  name   = "${local.name}-lambda-turn"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_turn[0].json
}

resource "aws_cloudwatch_log_group" "turn_scheduled" {
  count             = local.turn_stack ? 1 : 0
  name              = "/aws/lambda/${local.name}-turn-scheduled"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_lambda_function" "turn_scheduled" {
  count = local.turn_stack ? 1 : 0

  function_name = "${local.name}-turn-scheduled"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs20.x"
  handler       = "turnScheduled.handler"

  filename         = var.scheduled_lambda_zip
  source_code_hash = filebase64sha256(var.scheduled_lambda_zip)

  memory_size = 128
  timeout     = 60

  environment {
    variables = {
      ROOMS_TABLE               = aws_dynamodb_table.rooms.name
      TURN_EC2_INSTANCE_ID      = aws_instance.turn[0].id
      TURN_MAX_UPTIME_SECONDS     = "14400"
      TURN_USAGE_GRACE_SECONDS    = "900"
    }
  }

  depends_on = [aws_cloudwatch_log_group.turn_scheduled]
  tags       = local.common_tags
}

resource "aws_cloudwatch_event_rule" "turn_poll" {
  count               = local.turn_stack ? 1 : 0
  name                = "${local.name}-turn-poll"
  schedule_expression = "rate(15 minutes)"
  tags                = local.common_tags
}

resource "aws_cloudwatch_event_target" "turn_scheduled" {
  count = local.turn_stack ? 1 : 0
  rule  = aws_cloudwatch_event_rule.turn_poll[0].name
  arn   = aws_lambda_function.turn_scheduled[0].arn
}

resource "aws_lambda_permission" "turn_scheduled_events" {
  count         = local.turn_stack ? 1 : 0
  statement_id  = "AllowEventBridgeTurnPoll"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.turn_scheduled[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.turn_poll[0].arn
}
