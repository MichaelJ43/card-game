packer {
  required_plugins {
    amazon = {
      source  = "github.com/hashicorp/amazon"
      version = ">= 1.3.0"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "source_sha" {
  type    = string
  default = "local"
}

variable "pr_number" {
  type    = string
  default = ""
}

locals {
  ami_scope = var.pr_number != "" ? "pr" : "main"
  ami_name  = "card-game-coturn-${local.ami_scope}-${var.source_sha}-${formatdate("YYYYMMDDhhmmss", timestamp())}"
}

source "amazon-ebs" "coturn" {
  region        = var.aws_region
  instance_type = "t3.micro"
  ssh_username  = "ubuntu"
  ami_name      = local.ami_name

  source_ami_filter {
    filters = {
      architecture        = "x86_64"
      name                = "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    owners      = ["099720109477"]
    most_recent = true
  }

  tags = {
    Name                  = local.ami_name
    Project               = "card-game"
    Component             = "coturn"
    ManagedBy             = "packer"
    CardGameRelayAmiScope = local.ami_scope
    CardGameSourceSha     = var.source_sha
    CardGamePullRequest   = var.pr_number
  }
}

build {
  sources = ["source.amazon-ebs.coturn"]

  provisioner "shell" {
    inline = [
      "sudo apt-get update",
      "sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y",
      "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y coturn",
      "sudo systemctl enable coturn",
      "sudo truncate -s 0 /var/log/turnserver.log || true",
      "sudo rm -f /etc/turnserver.conf",
    ]
  }
}
