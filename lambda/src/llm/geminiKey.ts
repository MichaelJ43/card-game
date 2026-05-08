import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'

const sm = new SecretsManagerClient({})

let cachedKey: string | null = null
let cachedArn: string | undefined

export async function getGeminiApiKey(): Promise<string | null> {
  const arn = process.env.GEMINI_SECRET_ARN?.trim()
  if (!arn) return null
  if (cachedKey && cachedArn === arn) return cachedKey.length > 0 ? cachedKey : null
  const res = await sm.send(new GetSecretValueCommand({ SecretId: arn }))
  const v = typeof res.SecretString === 'string' ? res.SecretString.trim() : ''
  cachedKey = v
  cachedArn = arn
  return v.length > 0 ? v : null
}
