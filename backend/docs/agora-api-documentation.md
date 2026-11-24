# Agora RTC API Documentation

## Overview

The Agora RTC integration provides secure token-based authentication for audio and video calls. All endpoints require JWT authentication.

**Base URL:** `/api/agora`

---

## Endpoints

### 1. Generate RTC Token

Generate an Agora RTC token for joining a call channel.

**Endpoint:** `POST /api/agora/token`

**Authentication:** Required

**Rate Limit:** 10 requests/minute

**Request Body:**

```json
{
  "channelName": "conversation-uuid",
  "uid": "user-uuid",
  "role": "PUBLISHER"  // or "SUBSCRIBER" (optional, defaults to "PUBLISHER")
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "token": "006abc123def456...",
  "channelName": "conversation-uuid",
  "uid": "user-uuid",
  "appId": "your_agora_app_id",
  "role": "PUBLISHER",
  "expiresAt": "2026-02-13T14:05:45Z",
  "expiresIn": 3600
}
```

**Error Responses:**

```json
// 400 Bad Request
{
  "success": false,
  "error": "Channel name and UID are required"
}

// 403 Forbidden
{
  "success": false,
  "error": "UNAUTHORIZED_CHANNEL",
  "message": "You are not authorized to join this channel"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "TOKEN_GENERATION_FAILED",
  "message": "Failed to generate token"
}
```

---

### 2. Renew RTC Token

Renew an expiring Agora RTC token.

**Endpoint:** `POST /api/agora/token/renew`

**Authentication:** Required

**Rate Limit:** 10 requests/minute

**Request Body:**

```json
{
  "channelName": "conversation-uuid",
  "uid": "user-uuid"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "token": "006xyz789ghi012...",
  "channelName": "conversation-uuid",
  "uid": "user-uuid",
  "appId": "your_agora_app_id",
  "role": "PUBLISHER",
  "expiresAt": "2026-02-13T15:05:45Z",
  "expiresIn": 3600
}
```

**When to Use:**

- Call this endpoint when Agora SDK triggers `onTokenPrivilegeWillExpire` callback
- This happens ~30 seconds before token expiration

---

### 3. Get Channel Status

Get the status of an Agora channel (for debugging).

**Endpoint:** `GET /api/agora/channel/:channelName/status`

**Authentication:** Required

**Response (200 OK):**

```json
{
  "success": true,
  "channelName": "conversation-uuid",
  "userId": "user-uuid",
  "tokenMetadata": {
    "token": "006...",
    "channelName": "conversation-uuid",
    "uid": "user-uuid",
    "role": "PUBLISHER",
    "createdAt": "2026-02-13T13:05:45Z",
    "expiresAt": "2026-02-13T14:05:45Z",
    "expiresIn": "3600"
  },
  "isActive": true
}
```

---

### 4. Get Agora Configuration

Get Agora App ID (for frontend initialization).

**Endpoint:** `GET /api/agora/config`

**Authentication:** Required

**Response (200 OK):**

```json
{
  "success": true,
  "appId": "your_agora_app_id",
  "tokenExpiration": 3600
}
```

**Note:** App Certificate is NEVER sent to clients.

---

### 5. Get Active Channels (Admin Only)

Get list of active Agora channels.

**Endpoint:** `GET /api/agora/channels/active`

**Authentication:** Required (Admin role)

**Response (200 OK):**

```json
{
  "success": true,
  "channels": [
    "conversation-uuid-1",
    "conversation-uuid-2"
  ],
  "count": 2
}
```

---

## WebSocket Events with Agora

### Updated Events

#### `call-request-response` (Incoming Call)

**Payload:**

```json
{
  "request_type": "audio_call",
  "sender_name": "John Doe",
  "senderId": "sender-uuid",
  "request_id": "call-request-uuid",
  "chatId": "chat-uuid",
  "conversationId": "conversation-uuid",
  "balanceInfo": {
    "affordableMinutes": 10,
    "affordableSeconds": 600,
    "ratePerSecond": 0.5
  },
  "agora": {
    "token": "006abc123...",
    "channel": "conversation-uuid",
    "uid": "receiver-uuid",
    "appId": "your_agora_app_id",
    "expiresIn": 3600
  }
}
```

**Note:** `agora` field will be `null` if Agora is not configured.

---

#### `call-request:accepted` (Call Accepted)

**Payload:**

```json
{
  "request_id": "call-request-uuid",
  "chatId": "chat-uuid",
  "senderId": "sender-uuid",
  "receiverId": "receiver-uuid",
  "conversationId": "conversation-uuid",
  "balanceInfo": {
    "freeMinutesRemaining": 3,
    "freeSecondsRemaining": 180,
    "paidMinutesAffordable": 7,
    "totalMinutesAvailable": 10,
    "totalSecondsAvailable": 600,
    "ratePerSecond": 0.5
  }
}
```

---

#### `call-started` (Call Started Confirmation)

**Payload:**

```json
{
  "request_id": "call-request-uuid",
  "chatId": "chat-uuid",
  "senderId": "sender-uuid",
  "receiverId": "receiver-uuid",
  "conversationId": "conversation-uuid",
  "balanceInfo": {
    "freeMinutesRemaining": 3,
    "freeSecondsRemaining": 180,
    "paidMinutesAffordable": 7,
    "totalMinutesAvailable": 10,
    "totalSecondsAvailable": 600,
    "ratePerSecond": 0.5
  }
}
```

---

## Security Notes

1. **Never expose App Certificate** - It's stored only on the server
2. **Token validation** - Users can only get tokens for calls they're part of
3. **Rate limiting** - 10 requests/minute per user for token endpoints
4. **Token expiration** - Tokens expire after 1 hour by default
5. **Automatic renewal** - Frontend should renew tokens before expiration

---

## Error Handling

All Agora endpoints follow the standard error format:

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message"
}
```

**Common Error Codes:**

- `UNAUTHORIZED_CHANNEL` - User not authorized for this channel
- `UID_MISMATCH` - UID doesn't match authenticated user
- `TOKEN_GENERATION_FAILED` - Failed to generate token
- `TOKEN_RENEWAL_FAILED` - Failed to renew token
- `AGORA_NOT_CONFIGURED` - Agora not configured on server
- `TOO_MANY_REQUESTS` - Rate limit exceeded

---

## Configuration

Add these environment variables to `.env`:

```env
# Agora RTC Configuration
AGORA_APP_ID=your_agora_app_id_here
AGORA_APP_CERTIFICATE=your_agora_app_certificate_here
AGORA_TOKEN_EXPIRATION=3600
AGORA_PRIVILEGE_EXPIRATION=3600
```

Get your App ID and Certificate from [Agora Console](https://console.agora.io/).

---

## Testing

### Using cURL

```bash
# Get Agora config
curl -X GET http://localhost:4000/api/agora/config \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Generate token
curl -X POST http://localhost:4000/api/agora/token \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channelName": "test-channel",
    "uid": "user-123",
    "role": "PUBLISHER"
  }'

# Renew token
curl -X POST http://localhost:4000/api/agora/token/renew \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channelName": "test-channel",
    "uid": "user-123"
  }'
```

---

## Monitoring

### Logs

All Agora operations are logged:

```
INFO: Generated Agora RTC token for channel: conversation-123, uid: user-456, role: PUBLISHER
INFO: Token renewed for user user-456 in channel conversation-123
INFO: Generated Agora tokens for call call-request-789
WARN: Agora not configured, call will proceed without Agora tokens
ERROR: Failed to generate Agora tokens: [error details]
```

### Redis Keys

Agora uses Redis for token metadata:

- `agora-token:{channelName}:{uid}` - Token metadata
- Keys expire 5 minutes after token expiration

---

## Next Steps

1. **Create Agora Account** - Get App ID and Certificate
2. **Update .env** - Add real credentials
3. **Test Token Generation** - Use cURL or Postman
4. **Integrate Frontend** - See [Frontend Integration Guide](./agora-frontend-guide.md)
