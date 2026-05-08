import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { getHostDisconnectGraceMs, managementApiEndpoint } from './websocket'

describe('getHostDisconnectGraceMs', () => {
  const prev = process.env.HOST_DISCONNECT_GRACE_MS

  afterEach(() => {
    if (prev === undefined) delete process.env.HOST_DISCONNECT_GRACE_MS
    else process.env.HOST_DISCONNECT_GRACE_MS = prev
  })

  it('defaults to 60_000', () => {
    delete process.env.HOST_DISCONNECT_GRACE_MS
    expect(getHostDisconnectGraceMs()).toBe(60_000)
  })

  it('clamps to 5_000…120_000', () => {
    process.env.HOST_DISCONNECT_GRACE_MS = '2000'
    expect(getHostDisconnectGraceMs()).toBe(60_000)
    process.env.HOST_DISCONNECT_GRACE_MS = '30000'
    expect(getHostDisconnectGraceMs()).toBe(30_000)
    process.env.HOST_DISCONNECT_GRACE_MS = '200000'
    expect(getHostDisconnectGraceMs()).toBe(60_000)
  })
})

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
