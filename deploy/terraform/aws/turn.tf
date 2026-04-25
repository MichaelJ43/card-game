# Optional coturn EC2 + TURN DNS record + EventBridge idle scheduler.
# Requires: custom hostnames, Route 53 zone, turn_ec2_enabled = true.

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

data "aws_ami" "ubuntu_noble_x86" {
  count       = local.turn_stack ? 1 : 0
  most_recent = true
  owners      = ["099720109477"]
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

locals {
  turn_instance_stack = local.turn_stack && var.turn_compute_mode == "instance"
  turn_asg_stack      = local.turn_stack && var.turn_compute_mode == "asg"
  turn_ami_id         = local.turn_stack ? (trimspace(var.turn_ami_id) != "" ? trimspace(var.turn_ami_id) : data.aws_ami.ubuntu_noble_x86[0].id) : ""
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
    from_port   = var.turn_relay_min_port
    to_port     = var.turn_relay_max_port
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
  count                       = local.turn_instance_stack ? 1 : 0
  ami                         = local.turn_ami_id
  instance_type               = var.turn_instance_type
  subnet_id                   = sort(tolist(data.aws_subnets.default[0].ids))[0]
  vpc_security_group_ids      = [aws_security_group.turn[0].id]
  associate_public_ip_address = true

  user_data = base64encode(templatefile("${path.module}/turn-user-data.sh.tpl", {
    realm         = local.turn_hostname
    turn_user     = "cardgame"
    turn_password = trimspace(var.turn_coturn_static_password)
    min_port      = var.turn_relay_min_port
    max_port      = var.turn_relay_max_port
  }))

  lifecycle {
    precondition {
      condition     = !local.turn_stack || length(trimspace(var.turn_coturn_static_password)) >= 8
      error_message = "When the TURN EC2 stack is enabled, set turn_coturn_static_password (e.g. TF_VAR_turn_coturn_static_password from GitHub secret TURN_COTURN_STATIC_PASSWORD) to a shared password (min 8 characters) used by both Terraform user-data and VITE_MULTIPLAYER_TURN_CREDENTIAL."
    }
  }

  metadata_options {
    http_tokens = "required"
  }

  tags = merge(local.common_tags, {
    Name               = "${local.name}-coturn"
    CARDGAME_TURN_LINK = "coturn"
  })
}

resource "aws_launch_template" "turn" {
  count = local.turn_asg_stack ? 1 : 0

  name_prefix   = "${local.name}-coturn-"
  image_id      = local.turn_ami_id
  instance_type = var.turn_instance_type

  user_data = base64encode(templatefile("${path.module}/turn-user-data.sh.tpl", {
    realm         = local.turn_hostname
    turn_user     = "cardgame"
    turn_password = trimspace(var.turn_coturn_static_password)
    min_port      = var.turn_relay_min_port
    max_port      = var.turn_relay_max_port
  }))

  network_interfaces {
    associate_public_ip_address = true
    security_groups             = [aws_security_group.turn[0].id]
  }

  metadata_options {
    http_tokens = "required"
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(local.common_tags, {
      Name               = "${local.name}-coturn"
      CARDGAME_TURN_LINK = "coturn"
    })
  }

  tag_specifications {
    resource_type = "volume"
    tags          = local.common_tags
  }

  tags = merge(local.common_tags, { CARDGAME_TURN_LINK = "coturn" })
}

resource "aws_autoscaling_group" "turn" {
  count = local.turn_asg_stack ? 1 : 0

  name                = "${local.name}-coturn"
  min_size            = var.turn_asg_min_size
  desired_capacity    = var.turn_asg_desired_capacity
  max_size            = var.turn_asg_max_size
  vpc_zone_identifier = sort(tolist(data.aws_subnets.default[0].ids))

  launch_template {
    id      = aws_launch_template.turn[0].id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${local.name}-coturn"
    propagate_at_launch = true
  }

  tag {
    key                 = "CARDGAME_TURN_LINK"
    value               = "coturn"
    propagate_at_launch = true
  }

  dynamic "tag" {
    for_each = local.common_tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  lifecycle {
    precondition {
      condition     = !local.turn_stack || length(trimspace(var.turn_coturn_static_password)) >= 8
      error_message = "When the TURN EC2 stack is enabled, set turn_coturn_static_password (e.g. TF_VAR_turn_coturn_static_password from GitHub secret TURN_COTURN_STATIC_PASSWORD) to a shared password (min 8 characters) used by both Terraform user-data and VITE_MULTIPLAYER_TURN_CREDENTIAL."
    }
    precondition {
      condition     = var.turn_asg_min_size <= var.turn_asg_desired_capacity && var.turn_asg_desired_capacity <= var.turn_asg_max_size
      error_message = "TURN ASG capacity must satisfy min <= desired <= max."
    }
  }
}

resource "aws_autoscaling_policy" "turn_cpu_target" {
  count = local.turn_asg_stack && var.turn_asg_cpu_target_percent > 0 ? 1 : 0

  name                   = "${local.name}-coturn-cpu-target"
  autoscaling_group_name = aws_autoscaling_group.turn[0].name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    target_value = var.turn_asg_cpu_target_percent

    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
  }
}

# Placeholder A; Lambda overwrites with live public IP on /turn/start (ignore drift).
resource "aws_route53_record" "turn_a" {
  count   = local.turn_stack ? 1 : 0
  zone_id = local.route53_zone_id
  name    = local.turn_hostname
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
    sid = "TurnEc2Describe"
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeInstanceStatus",
    ]
    resources = ["*"]
  }

  dynamic "statement" {
    for_each = local.turn_instance_stack ? [1] : []
    content {
      sid = "TurnEc2StartStop"
      actions = [
        "ec2:StartInstances",
        "ec2:StopInstances",
      ]
      resources = [aws_instance.turn[0].arn]
    }
  }

  dynamic "statement" {
    for_each = local.turn_asg_stack ? [1] : []
    content {
      sid = "TurnAsgScale"
      actions = [
        "autoscaling:DescribeAutoScalingGroups",
        "autoscaling:SetDesiredCapacity",
      ]
      resources = ["*"]
    }
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
      ROOMS_TABLE              = aws_dynamodb_table.rooms.name
      TURN_CONTROL_MODE        = var.turn_compute_mode
      TURN_EC2_INSTANCE_ID     = local.turn_instance_stack ? aws_instance.turn[0].id : ""
      TURN_ASG_NAME            = local.turn_asg_stack ? aws_autoscaling_group.turn[0].name : ""
      TURN_ASG_MIN_SIZE        = tostring(var.turn_asg_min_size)
      TURN_MAX_UPTIME_SECONDS  = "14400"
      TURN_USAGE_GRACE_SECONDS = "900"
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
