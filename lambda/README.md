# card-game multiplayer Lambdas

Two bundles:

- **`http.ts`** — API Gateway HTTP API; handles `POST /rooms` and `POST /rooms/join`.
  Issues short-lived JWTs used by clients to authenticate to the WebSocket API.
- **`websocket.ts`** — API Gateway WebSocket API; stores connections in DynamoDB and
  relays `SignalingRelay` envelopes between the host and its clients.

Both handlers share `storage.ts` (DynamoDB helpers) and `auth.ts` (JWT helpers).

Expected environment variables (set by Terraform):

- `ROOMS_TABLE` — DynamoDB table name, attributes `{ pk: 'ROOM#<code>', sk: 'META'|'CONN#<connectionId>' }`.
- `ROOM_JWT_SECRET` — signing key for short-lived room tokens.
- `WS_ENDPOINT` — the API Gateway WebSocket Management API endpoint (`https://<id>.execute-api.<region>.amazonaws.com/<stage>`).
- `ROOM_TTL_SECONDS` — default 86400 (24h) idle TTL on rooms (set as DynamoDB TTL).
- `ALLOWED_ORIGIN` — CORS allow-list origin for HTTP endpoints (e.g. the CloudFront distribution).

Build: `npm run build && npm run bundle`. Bundling produces zip files under `dist/` for upload by Terraform.
