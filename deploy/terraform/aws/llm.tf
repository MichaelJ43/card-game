resource "aws_secretsmanager_secret" "gemini_api_key" {
  name        = "${local.name}/gemini-api-key"
  description = "Gemini API key for LLM table AI (value set by CI outside Terraform state)."
  tags        = local.common_tags
}
