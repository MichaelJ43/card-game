terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Populate with your remote state backend. Example (S3 + DynamoDB lock):
  #
  #   backend "s3" {
  #     bucket         = "card-game-tfstate"
  #     key            = "card-game/terraform.tfstate"
  #     region         = "us-east-1"
  #     dynamodb_table = "card-game-tfstate-lock"
  #     encrypt        = true
  #   }
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}

# CloudFront + ACM certs must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
