import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { managementApiEndpoint } from './websocket'

describe('managementApiEndpoint', () => {
  const prevRegion = process.env.AWS_REGION

  beforeEach(() => {
    process.env.AWS_REGION = 'us-east-1'
  })

  afterEach(() => {
    if (prevRegion === undefined) delete process.env.AWS_REGION
    else process.env.AWS_REGION = prevRegion
  })

  it('uses execute-api hostname when apiId and AWS_REGION are set (custom domain safe)', () => {
    const event = {
      requestContext: {
        apiId: 'abc123def',
        domainName: 'ws.example.com',
        stage: 'prod',
      },
    } as unknown as APIGatewayProxyWebsocketEventV2
    expect(managementApiEndpoint(event)).toBe(
      'https://abc123def.execute-api.us-east-1.amazonaws.com/prod',
    )
  })

  it('falls back to domainName/stage when apiId is missing', () => {
    const event = {
      requestContext: {
        domainName: 'abc123def.execute-api.us-east-1.amazonaws.com',
        stage: 'prod',
      },
    } as unknown as APIGatewayProxyWebsocketEventV2
    expect(managementApiEndpoint(event)).toBe(
      'https://abc123def.execute-api.us-east-1.amazonaws.com/prod',
    )
  })
})
