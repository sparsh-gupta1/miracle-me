# Miracle Me - Complete API & Socket.io Documentation for Frontend

> **Last Updated:** February 5, 2026  
> **Base URL:** `https://api.teachifyy.com/api` (Production) | `http://localhost:3000/api` (Development)  
> **WebSocket URL:** Same as base URL (Socket.io connects to root `/`)

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [REST API Endpoints](#2-rest-api-endpoints)
   - [Auth](#auth-endpoints)
   - [User](#user-endpoints)
   - [Chat](#chat-endpoints)
   - [Documents](#document-endpoints)
   - [Payments](#payment-endpoints)
   - [Transactions](#transaction-endpoints)
   - [Pricing](#pricing-endpoints)
   - [Notifications](#notification-endpoints)
3. [WebSocket Events](#3-websocket-events)
   - [Connection & Authentication](#connection--authentication)
   - [Chat Events](#chat-events)
   - [Conversation Events](#conversation-events)
   - [Call Request Events](#call-request-events)
   - [Wallet Events](#wallet-events)
   - [Withdrawal Events](#withdrawal-events)
4. [Error Handling](#4-error-handling)
5. [Data Models](#5-data-models)

---

## 1. Authentication

All authenticated endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

### Getting a Token

Use the `/api/auth/verify-otp` or `/api/auth/google` endpoints to obtain a JWT token.

---

## 2. REST API Endpoints

### Auth Endpoints

**Base Path:** `/api/auth`

| Method | Endpoint | Auth Required | Description | Request Body | Response |
|--------|----------|---------------|-------------|--------------|----------|
| `POST` | `/request-otp` | No | Request OTP for login/signup | `{ "mobileNumber": "1234567890", "role": "user" }` | `{ "success": true, "message": "OTP sent" }` |
| `POST` | `/verify-otp` | No | Verify OTP and get JWT token | `{ "mobileNumber": "...", "otp": "123456", "deviceToken": "..." }` | `{ "success": true, "token": "jwt_token", "user": {...} }` |
| `POST` | `/google` | No | Google OAuth authentication | `{ "token": "GOOGLE_ID_TOKEN", "role": "user" }` | `{ "success": true, "token": "jwt_token", "user": {...} }` |
| `POST` | `/admin-login` | No | Admin login with email/password | `{ "email": "admin@example.com", "password": "..." }` | `{ "success": true, "token": "jwt_token", "user": {...} }` |
| `POST` | `/listener-login` | No | Listener login | `{ "email": "...", "password": "..." }` | `{ "success": true, "token": "jwt_token", "user": {...} }` |
| `PUT` | `/logout` | Yes | Logout current user | - | `{ "success": true, "message": "Logged out" }` |

---

### User Endpoints

**Base Path:** `/api/user`  
**Auth Required:** Yes (All endpoints)

| Method | Endpoint | Roles | Description | Request Body / Params | Response |
|--------|----------|-------|-------------|----------------------|----------|
| `GET` | `/` | All | Get current user profile | - | `{ "user": {...} }` |
| `GET` | `/:userId/status` | All | Get user's online status | URL Param: `userId` | `{ "userId": "...", "isOnline": true, "lastSeen": "..." }` |
| `GET` | `/:roleid/search` | All | Search users by role to start chat | URL Param: `roleid` | `{ "users": [...] }` |
| `POST` | `/change-name` | Admin, Listener, Astrologer | Change user name in a chat | `{ "chatId": "...", "name": "New Name" }` | `{ "success": true }` |
| `POST` | `/block-user` | All | Block a user | `{ "userId": "..." }` | `{ "success": true }` |
| `GET` | `/block-user` | All | Get list of blocked users | - | `{ "blockedUsers": [...] }` |
| `GET` | `/receiver-profile/:receiverId` | All | Get chat receiver's profile | URL Param: `receiverId` | `{ "user": {...} }` |
| `GET` | `/:roleid/admin-panel` | Admin | Get users by role (admin panel) | URL Param: `roleid` | `{ "users": [...] }` |
| `PATCH` | `/:userid/active-status` | Admin | Activate/deactivate user | URL Param: `userid` | `{ "success": true }` |
| `POST` | `/create` | Admin | Create new user (admin) | `{ "name": "...", "email": "...", "role": "..." }` | `{ "success": true, "user": {...} }` |

---

### Chat Endpoints

**Base Path:** `/api/chats`  
**Auth Required:** Yes (All endpoints)

| Method | Endpoint | Description | Request Body / Params | Response |
|--------|----------|-------------|----------------------|----------|
| `GET` | `/` | Get all user's chats | Query: `page`, `limit` | `{ "chats": [...], "hasMore": true, "totalCount": 10 }` |
| `POST` | `/` | Create or get existing chat | `{ "receiverId": "..." }` | `{ "chat": {...} }` |
| `GET` | `/:chatId/messages` | Get messages in a chat | URL Param: `chatId`, Query: `page`, `limit` | `{ "messages": [...], "hasMore": true }` |
| `POST` | `/:chatId/messages` | Send text message (HTTP fallback) | `{ "receiverId": "...", "content": "..." }` | `{ "message": {...} }` |
| `POST` | `/media` | Upload media & send message | Form-Data: `file`, `chatId`, `receiverId` | `{ "message": {...}, "url": "..." }` |
| `PATCH` | `/:chatId/read` | Mark messages as read | URL Param: `chatId` | `{ "success": true }` |
| `DELETE` | `/messages/:messageId` | Delete a message | URL Param: `messageId` | `{ "success": true }` |
| `GET` | `/:chatId/search` | Search messages in chat | URL Param: `chatId`, Query: `q` | `{ "messages": [...] }` |
| `GET` | `/unread-counts` | Get total unread message count | - | `{ "unreadCount": 5 }` |

---

### Document Endpoints

**Base Path:** `/api/documents`  
**Auth Required:** Yes (All endpoints)

| Method | Endpoint | Description | Request Body / Params | Response |
|--------|----------|-------------|----------------------|----------|
| `POST` | `/upload` | Upload single document | Form-Data: `file` | `{ "document": {...}, "url": "..." }` |
| `POST` | `/upload-multiple` | Upload multiple documents (max 5) | Form-Data: `files[]` | `{ "documents": [...] }` |
| `GET` | `/` | Get all user's documents | - | `{ "documents": [...] }` |
| `GET` | `/download/:key` | Get presigned download URL | URL Param: `key` (URL encoded) | `{ "url": "presigned_s3_url" }` |
| `DELETE` | `/:key` | Delete a document | URL Param: `key` (URL encoded) | `{ "success": true }` |

---

### Payment Endpoints

**Base Path:** `/api/payments`  
**Auth Required:** Yes

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| `POST` | `/order` | Create Cashfree payment order | `{ "amount": 1000, "currency": "INR" }` | `{ "orderId": "...", "cfOrderId": "...", "paymentSessionId": "..." }` |
| `POST` | `/verify` | Verify payment signature | `{ "orderId": "...", "paymentId": "...", "signature": "..." }` | `{ "success": true, "transaction": {...} }` |

---

### Transaction Endpoints

**Base Path:** `/api/transactions`  
**Auth Required:** Yes (except webhook)

| Method | Endpoint | Roles | Description | Request Body / Params | Response |
|--------|----------|-------|-------------|----------------------|----------|
| `POST` | `/webhook` | Public | Cashfree webhook handler | Cashfree webhook payload | `{ "status": "ok" }` |
| `POST` | `/` | All | Create transaction | `{ "amount": 100, "type": "credit/debit", "description": "..." }` | `{ "transaction": {...} }` |
| `GET` | `/my` | All | Get my transactions | Query: `page`, `limit` | `{ "transactions": [...], "hasMore": true }` |
| `POST` | `/:transactionId/refund` | All | Initiate refund | URL Param: `transactionId` | `{ "success": true, "refund": {...} }` |
| `GET` | `/` | Admin | Get all transactions (admin) | Query: `page`, `limit`, filters | `{ "transactions": [...] }` |

---

### Pricing Endpoints

**Base Path:** `/api/pricing`  
**Auth Required:** Yes (All endpoints)

| Method | Endpoint | Roles | Description | Request Body / Params | Response |
|--------|----------|-------|-------------|----------------------|----------|
| `GET` | `/effective/:astrologerId/:serviceType` | All | Get effective pricing for astrologer | URL Params: `astrologerId`, `serviceType` | `{ "pricing": {...} }` |
| `POST` | `/listener` | Admin | Create listener global pricing | `{ "serviceType": "chat/audio/video", "ratePerMinute": 10 }` | `{ "pricing": {...} }` |
| `PUT` | `/listener/:pricingId` | Admin | Update listener pricing | `{ "ratePerMinute": 15 }` | `{ "pricing": {...} }` |
| `GET` | `/listener` | Admin | Get all listener pricing | - | `{ "pricing": [...] }` |
| `GET` | `/listener/:serviceType/history` | Admin | Get listener pricing history | URL Param: `serviceType` | `{ "history": [...] }` |
| `POST` | `/astrologer` | Astrologer | Create custom astrologer pricing | `{ "serviceType": "chat/audio/video", "ratePerMinute": 20 }` | `{ "pricing": {...} }` |
| `GET` | `/astrologer/my` | Astrologer | Get my pricing | - | `{ "pricing": [...] }` |
| `PUT` | `/astrologer/:serviceType` | Astrologer | Update astrologer pricing | `{ "ratePerMinute": 25 }` | `{ "pricing": {...} }` |
| `DELETE` | `/astrologer/:serviceType` | Astrologer | Delete custom pricing | URL Param: `serviceType` | `{ "success": true }` |

---

### Notification Endpoints

**Base Path:** `/api/notification`  
**Auth Required:** No

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| `POST` | `/` | Send push notification | `{ "userId": "...", "title": "...", "body": "..." }` | `{ "success": true }` |

---

## 3. WebSocket Events

### Connection & Authentication

**Connection URL:** Same as your API base URL (e.g., `https://api.teachifyy.com` or `http://localhost:3000`)

**Authentication:** Pass JWT token in connection options:

```javascript
import io from 'socket.io-client';

const socket = io('https://api.teachifyy.com', {
  auth: {
    token: 'your_jwt_token_here'
  }
});
```

**User Rooms:** Upon connection, users are automatically joined to:
- `user:{userId}` - Personal room for user-specific events

---

### Chat Events

#### Client → Server (Events you EMIT)

| Event Name | Payload | Description |
|------------|---------|-------------|
| `join-chat` | `{ "chatId": "...", "receiverId": "..." }` | Join a chat room to receive real-time messages |
| `leave-chat` | `{ "chatId": "..." }` | Leave a chat room |
| `send-message` | `{ "chatId": "...", "receiverId": "...", "content": "...", "messageType": "text" }` | Send a text message (for media, use REST API `/api/chats/media`) |
| `load-messages` | `{ "chatId": "...", "page": 1, "limit": 50 }` | Load older messages (pagination) |
| `typing-start` | `{ "chatId": "..." }` | Notify other user you're typing |
| `typing-stop` | `{ "chatId": "..." }` | Notify other user you stopped typing |
| `delete-message` | `{ "chatId": "...", "messageId": "..." }` | Delete a message for both users |
| `search-messages` | `{ "chatId": "...", "query": "...", "page": 1, "limit": 20 }` | Search messages in chat |
| `get-chats` | `{ "page": 1, "limit": 20 }` | Request list of user's chats |
| `user-online` | `{}` | Signal that user is actively using the app |
| `check-video-call-status` | `{ "receiverId": "..." }` | Check if user is in a video call |
| `user-manual-status` | `{ "status": "online" \| "offline" }` | Manually toggle availability (listeners only) |
| `user-manual-video-call` | `{ "isVideoCall": true/false }` | Set video call status manually |

#### Server → Client (Events you LISTEN for)

| Event Name | Payload | Description |
|------------|---------|-------------|
| `chat-joined` | `{ "chatId": "...", "messages": [...], "hasMore": true, "totalCount": 50 }` | Confirmation of joining chat with recent messages |
| `chat-left` | `{ "chatId": "..." }` | Confirmation of leaving chat |
| `new-message` | `{ "id": "...", "chatId": "...", "senderId": "...", "receiverId": "...", "content": "...", "messageType": "text", "sender": "me" \| "them", "createdAt": "...", "isDelivered": true, "isRead": false }` | New message received or sent |
| `new-message-notification` | `{ "chatId": "...", "senderId": "...", "senderName": "...", "content": "...", "messageType": "text", "createdAt": "..." }` | Notification when online but NOT in chat room |
| `messages-loaded` | `{ "chatId": "...", "messages": [...], "hasMore": true, "currentPage": 1 }` | Result of `load-messages` |
| `message-delivered` | `{ "messageId": "...", "chatId": "...", "deliveredTo": "...", "deliveredAt": "..." }` | Message delivered confirmation |
| `messages-read` | `{ "chatId": "...", "messageIds": [...], "readBy": "...", "readAt": "..." }` | Messages marked as read |
| `user-typing` | `{ "chatId": "...", "userId": "...", "isTyping": true/false }` | Real-time typing indicator |
| `message-deleted` | `{ "messageId": "...", "chatId": "...", "deletedBy": "..." }` | Message was deleted |
| `search-results` | `{ "chatId": "...", "query": "...", "results": [...], "hasMore": true, "totalCount": 10 }` | Search results |
| `chats-loaded` | `{ "chats": [...], "hasMore": true, "totalCount": 20, "currentPage": 1 }` | List of user's chats |
| `user-status-changed` | `{ "userId": "...", "isOnline": true/false, "isBusy": true/false, "lastSeen": "..." }` | User online/offline/busy status update. Events about a regular user (and `listener:status-changed` busy events about a regular user) go only to listener, astrologer and admin clients; events about listeners/astrologers go to everyone. Always check `userId` / `listenerId` before applying. |
| `video-call-status` | `{ "isVideoCall": true/false }` | Video call status check result |
| `chat-session-started` | `{ "chatId": "...", "message": "..." }` | Sent to the sender of the first message. The session is open but **not billed yet**: it is waiting for the listener/astrologer to reply. Show a "waiting for reply" state. |
| `chat-session-connected` | `{ "chatId": "...", "message": "..." }` | The listener/astrologer replied (or opened the chat). Billing and free-minute use start **now**. Sent once per session to both users. |
| `chat-session-ended` | `{ "chatId": "...", "durationSeconds": 0, "reason": "inactivity" \| "balance_exhausted" \| "no_response" \| "manual", "message": "..." }` | Chat session closed. Sent to the chat room and both users' personal rooms, so close the chat screen even if you were not on it. `balance_exhausted`: free minutes and wallet are used up; the payer also gets `wallet:recharge_required`. `manual`: the other side ended it with `conversation:end`; close the chat screen. `no_response`: the listener didn't reply within 60s; the user was **not charged** and keeps their free minutes, so let them pick another listener. |
| `error` | `{ "message": "Error description" }` | Error occurred |

---

### Conversation Events

> **Note:** Conversations are for paid services (audio/video calls with billing)

#### Client → Server (Events you EMIT with callback)

| Event Name | Payload | Callback Response | Description |
|------------|---------|-------------------|-------------|
| `conversation:create` | `{ "participant2Id": "...", "serviceType": "chat/audio/video" }` | `{ "success": true, "conversation": {...} }` | Create a new conversation |
| `conversation:validate_balance` | `{ "participant2Id": "...", "serviceType": "chat/audio/video" }` | `{ "success": true, "balanceInfo": {...} }` | Validate balance before starting |
| `conversation:start` | `{ "conversationId": "..." }` | `{ "success": true, "conversation": {...}, "balanceInfo": {...} }` | Start a conversation |
| `conversation:end` | `{ "conversationId": "..." }` | `{ "success": true, "result": {...} }` | End a conversation. Both users get `conversation:ended`, plus `chat-session-ended` (chat) or `call-ended` (call), in their personal room. Ending one that is already ended still succeeds, so the second side can always leave. |
| `conversation:join` | `{ "conversationId": "..." }` | `{ "success": true }` | Join conversation room |
| `conversation:leave` | `{ "conversationId": "..." }` | `{ "success": true }` | Leave conversation room |
| `conversation:get_active` | - | `{ "success": true, "conversations": [...] }` | Get active conversations |

#### Server → Client (Events you LISTEN for)

| Event Name | Payload | Description |
|------------|---------|-------------|
| `conversation:created` | `{ "id": "...", "participant1Id": "...", "participant2Id": "...", "serviceType": "...", "status": "pending" }` | Conversation created |
| `conversation:started` | `{ "conversationId": "...", "startedAt": "...", "status": "active", "balanceInfo": {...} }` | Conversation started |
| `conversation:ended` | `{ "conversationId": "...", "endedAt": "...", "durationSeconds": 120, "status": "completed" }` | Conversation ended. Sent to both participants' personal rooms, so you get it even if you never joined the conversation room. |
| `conversation:participant_joined` | `{ "conversationId": "...", "userId": "...", "joinedAt": "..." }` | Participant joined |
| `conversation:participant_left` | `{ "conversationId": "...", "userId": "...", "leftAt": "..." }` | Participant left |

**Balance Info Structure:**
```json
{
  "affordableSeconds": 600,
  "affordableMinutes": 10,
  "ratePerSecond": 0.5,
  "currentBalance": 300
}
```

---

## Free Minutes API

> **New Feature:** Admin-configurable free trial minutes for each service type

### Admin Endpoints (Require Admin Role)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/free-minutes` | Required | Create/update free minutes config |
| `GET` | `/api/free-minutes` | Required | Get all free minutes configs |
| `GET` | `/api/free-minutes/:serviceType` | Required | Get config for specific service |
| `DELETE` | `/api/free-minutes/:serviceType` | Required | Disable free minutes for service |

#### Create/Update Free Minutes Config

**POST** `/api/free-minutes`

**Request Body:**
```json
{
  "serviceType": "audio_call",  // chat, audio_call, or video_call
  "freeMinutes": 5
}
```

**Response:**
```json
{
  "success": true,
  "config": {
    "id": "uuid",
    "serviceType": "audio_call",
    "freeMinutes": 5,
    "isActive": true,
    "createdAt": "2026-02-05T...",
    "updatedAt": "2026-02-05T..."
  }
}
```

#### Get All Configs

**GET** `/api/free-minutes`

**Response:**
```json
{
  "success": true,
  "configs": [
    {
      "id": "uuid",
      "serviceType": "chat",
      "freeMinutes": 10,
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "..."
    },
    {
      "id": "uuid",
      "serviceType": "audio_call",
      "freeMinutes": 5,
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### User Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/free-minutes/my-usage` | Required | Get my free minutes usage |
| `GET` | `/api/free-minutes/my-usage/:serviceType` | Required | Get usage for specific service |

#### Get My Free Minutes Usage

**GET** `/api/free-minutes/my-usage`

**Response:**
```json
{
  "success": true,
  "usage": [
    {
      "serviceType": "audio_call",
      "totalFreeMinutes": 5,
      "totalFreeSeconds": 300,
      "consumedMinutes": 2,
      "consumedSeconds": 120,
      "remainingMinutes": 3,
      "remainingSeconds": 180
    },
    {
      "serviceType": "video_call",
      "totalFreeMinutes": 3,
      "totalFreeSeconds": 180,
      "consumedMinutes": 0,
      "consumedSeconds": 0,
      "remainingMinutes": 3,
      "remainingSeconds": 180
    }
  ]
}
```

#### Get Usage for Specific Service

**GET** `/api/free-minutes/my-usage/audio_call`

**Response:**
```json
{
  "success": true,
  "usage": {
    "serviceType": "audio_call",
    "totalFreeMinutes": 5,
    "totalFreeSeconds": 300,
    "consumedMinutes": 2,
    "consumedSeconds": 120,
    "remainingMinutes": 3,
    "remainingSeconds": 180
  }
}
```

### How Free Minutes Work

1. **Admin Configuration**: Admins set free minutes per service type
2. **Auto-Initialization**: Users automatically receive free minutes when first checking balance
3. **Consumption Priority**: Free minutes are consumed **before** wallet balance
4. **Only connected time counts**: nothing is consumed until the session connects. A call connects when both people have joined; a chat connects when the listener/astrologer sends their first reply (`chat-session-connected`). A busy/unanswered attempt, or a chat that gets no reply within 60s (`chat-session-ended` with `no_response`), uses no free minutes.
5. **Billing Logic**:
   - If call duration ≤ free minutes: No charge, only free minutes consumed
   - If call duration > free minutes: Free minutes consumed first, then wallet charged for remaining time
6. **Real-time Updates**: All call events include free minutes information
7. **When free minutes run out**:
   - Wallet has money: the session keeps going on paid time with no event; the final bill shows the free and paid split.
   - Wallet is ₹0: the session ends automatically when free time is used up. Both users get the end event (`chat-session-ended` with `balance_exhausted`, or `call-ended` with `balance_exhausted` and `auto_leave: true` plus `call-auto-ended`), and the payer always gets `wallet:recharge_required` (`balanceAfter: 0`, `freeSecondsRemaining: 0`), even for a fully free session. A new request is then refused for insufficient balance until they recharge.

**Example Scenario:**
```
User has: 3 free minutes + ₹100 balance (3 paid minutes at ₹30/min)
Makes 5-minute call:
  - Consumes: 3 free minutes
  - Charges: ₹60 for 2 minutes
  - Remaining: 0 free minutes, ₹40 balance
```

---

### Call Request Events

> **Note:** For Agora-based audio/video calls with **automatic balance validation and billing**

#### Client → Server (Events you EMIT)

| Event Name | Payload | Description |
|------------|---------|-------------|
| `call-balance-check` | `{ "receiver_id": "...", "request_type": "audio/video" }` | **NEW:** Check balance before initiating call (with callback) |
| `call-request` | `{ "request_type": "audio/video", "receiver_id": "..." }` | Send call request (validates balance automatically) |
| `call-request:accept` | `{ "request_id": "..." }` | Accept incoming call (starts conversation & billing) |
| `call-request:reject` | `{ "request_id": "..." }` | Reject incoming call |
| `call-audio-toggle` | `{ "receiver_id": "...", "request_id": "...", "isMuted": true/false }` | Toggle audio during call |
| `call-video-toggle` | `{ "receiver_id": "...", "request_id": "...", "isVideoOff": true/false }` | Toggle video during call |
| `call-end` | `{ "receiver_id": "...", "request_id": "..." }` | End call (processes billing automatically) |
| `ping` | - | Heartbeat for connection monitoring |

**NEW: `call-balance-check` Event (with callback):**
```javascript
socket.emit('call-balance-check', {
  receiver_id: 'listener-id',
  request_type: 'audio' // or 'video'
}, (response) => {
  if (response.success) {
    console.log('Balance Info:', response.balanceInfo);
    // {
    //   balance: 500,
    //   pricePerMinute: 30,
    //   ratePerSecond: 0.5,
    //   affordableSeconds: 1000,
    //   affordableMinutes: 16,
    //   hasSufficientBalance: true,
    //   minimumBalanceRequired: 30
    // }
  } else {
    console.error('Error:', response.error);
  }
});
```

#### Server → Client (Events you LISTEN for)

| Event Name | Payload | Description |
|------------|---------|-------------|
| `call-request-response` | `{ "request_type": "audio/video", "sender_name": "...", "senderId": "...", "request_id": "...", "chatId": "...", "conversationId": "...", "balanceInfo": {...} }` | Incoming call request **with balance info** |
| `call-request:accepted` | `{ "request_id": "...", "chatId": "...", "senderId": "...", "receiverId": "...", "conversationId": "...", "balanceInfo": {...} }` | Call accepted **with affordable duration** |
| `call-started` | `{ "request_id": "...", "conversationId": "...", "balanceInfo": {...} }` | **NEW:** Call started confirmation (receiver only) |
| `call-request:rejected` | `{ "request_id": "..." }` | Call rejected |
| `call-timeout` | `{ "request_id": "...", "request_type": "chat/audio_call/video_call", "reason": "no_answer" }` | Call/chat request auto-timed out after 30 seconds (sent to both caller and receiver) |
| `call-audio-toggled` | `{ "request_id": "...", "sender_id": "...", "isMuted": true/false }` | Other user toggled audio |
| `call-video-toggled` | `{ "request_id": "...", "sender_id": "...", "isVideoOff": true/false }` | Other user toggled video |
| `call-ended` | `{ "request_id": "...", "sender_id": "...", "reason": "user_ended", "auto_leave": true }` | Call ended. When `auto_leave` is `true`, **leave the Agora channel and close the call screen immediately; do not show an end-call dialog.** It is sent to both users whenever either side hangs up (`user_ended` = tapped end, `peer_left` = left the Agora channel / closed the app), or when a dropped call is not resumed (`reconnect_timeout`, `disconnect`). `sender_id` is the user who left. `call-participant-disconnected` now fires only for a real network drop; show at most a small "reconnecting…" banner for it. `reason: "superseded"` means the caller replaced this not-yet-started request with a new one to you (e.g. switched an accepted chat request to a call) — just dismiss it. |
| `chat-request:expired` | `{ "request_id": "...", "chatId": "...", "reason": "no_first_message" }` | A chat request was accepted but no message was sent within 60s. Both users are free again; close the "waiting" UI. |
| `call-billing-processed` | `{ "conversationId": "...", "durationSeconds": 120, "amountCharged": 60, "balanceAfter": 440 }` | **NEW:** Billing processed after call |
| `wallet:balance_updated` | `{ "type": "debit/credit", "amount": 60, "balanceAfter": 440, "description": "...", "conversationId": "...", "durationSeconds": 120 }` | **NEW:** Wallet updated after call |
| `call-request:error` | `{ "message": "Insufficient balance. You have ₹10.00, but need at least ₹30.00 for 1 minute of audio call", "balanceInfo": {...} }` | Call request error (e.g., insufficient balance) |
| `pong` | - | Heartbeat response |

**Balance Info Structure (in call events):**
```json
{
  "affordableSeconds": 600,
  "affordableMinutes": 10,
  "ratePerSecond": 0.5
}
```

**Important Changes:**
- ✅ **Balance validation** happens automatically when you emit `call-request`
- ✅ **Conversation tracking** is automatic - you receive `conversationId` in responses
- ✅ **Billing is automatic** - when call ends, billing is processed and wallet is updated
- ✅ **Disconnect handling** - if user disconnects during call, billing is still processed
- ✅ **Pre-call balance check** - use `call-balance-check` to show affordable duration before calling

---

### Wallet Events

#### Client → Server (Events you EMIT with callback)

| Event Name | Payload | Callback Response | Description |
|------------|---------|-------------------|-------------|
| `wallet:get_balance` | - | `{ "success": true, "balance": 1000 }` | Get wallet balance |
| `wallet:get_details` | - | `{ "success": true, "wallet": {...} }` | Get wallet details |
| `wallet:get_transactions` | `{ "filters": {...}, "pagination": {...} }` | `{ "success": true, "transactions": [...] }` | Get wallet transactions |
| `wallet:get_stats` | - | `{ "success": true, "stats": {...} }` | Get wallet statistics |
| `wallet:subscribe` | - | `{ "success": true, "message": "Subscribed" }` | Subscribe to wallet updates |
| `wallet:unsubscribe` | - | `{ "success": true, "message": "Unsubscribed" }` | Unsubscribe from updates |

#### Server → Client (Events you LISTEN for)

| Event Name | Payload | Description |
|------------|---------|-------------|
| `wallet:balance_updated` | `{ "type": "credit/debit", "amount": 100, "balanceAfter": 900, "description": "..." }` | Wallet balance updated |
| `wallet:transaction_created` | `{ "id": "...", "type": "credit/debit", "amount": 100, "description": "...", "createdAt": "..." }` | New transaction created |

---

### Withdrawal Events

#### Client → Server (Events you EMIT with callback)

| Event Name | Payload | Callback Response | Description |
|------------|---------|-------------------|-------------|
| `withdrawal:get_rule` | - | `{ "success": true, "rule": {...} }` | Get current withdrawal rule |
| `withdrawal:validate` | `{ "amount": 500 }` | `{ "success": true, "isValid": true, "message": "..." }` | Validate withdrawal request |
| `withdrawal:create` | `{ "amount": 500 }` | `{ "success": true, "request": {...} }` | Create withdrawal request |
| `withdrawal:get_my_requests` | `{ "filters": {...}, "pagination": {...} }` | `{ "success": true, "requests": [...] }` | Get my withdrawal requests |
| `withdrawal:get_stats` | - | `{ "success": true, "stats": {...} }` | Get withdrawal statistics |
| `withdrawal:get_pending` | `{ "pagination": {...} }` | `{ "success": true, "requests": [...] }` | Get pending withdrawals (Admin) |
| `withdrawal:approve` | `{ "requestId": "..." }` | `{ "success": true, "result": {...} }` | Approve withdrawal (Admin) |
| `withdrawal:reject` | `{ "requestId": "...", "reason": "..." }` | `{ "success": true, "request": {...} }` | Reject withdrawal (Admin) |
| `withdrawal:subscribe` | - | `{ "success": true, "message": "Subscribed" }` | Subscribe to withdrawal updates |

#### Server → Client (Events you LISTEN for)

| Event Name | Payload | Description |
|------------|---------|-------------|
| `withdrawal:status_updated` | `{ "requestId": "...", "status": "pending/approved/rejected", "amount": 500, "requestedAt": "..." }` | Withdrawal status updated |
| `withdrawal:new_request` | `{ "requestId": "...", "userId": "...", "amount": 500, "requestedAt": "..." }` | New withdrawal request (Admin) |
| `withdrawal:approved` | `{ "requestId": "...", "amount": 500, "processedAt": "..." }` | Withdrawal approved |
| `withdrawal:rejected` | `{ "requestId": "...", "reason": "...", "processedAt": "..." }` | Withdrawal rejected |

---

## 4. Error Handling

### REST API Errors

All REST API errors follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE" // Optional
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

### WebSocket Errors

#### Busy errors (`error`, `call-request:error`, `conversation:error`)

Always branch on `error_code`, not on `message`: the codes say **who** is busy.

| `error_code` | Meaning | What to show |
|---|---|---|
| `CALLER_IN_SESSION` | **You** (the sender) are still in another chat/call, or have an open request with someone else. The listener you tapped is **not** busy. | "You're already chatting with `{activeSession.peerName}`. End that chat first." Offer to open `activeSession.chatId`. Do **not** mark the listener busy. |
| `LISTENER_BUSY` | The other person is in a session or on do-not-disturb. | "{name} is busy right now." |
| `TRY_AGAIN` | Another request was being set up at the same moment, or a check failed. Nobody is busy. | "Please try again." Do not mark anyone busy. |

`CALLER_IN_SESSION` payload:

```json
{
  "message": "You are currently busy in another session.",
  "error_code": "CALLER_IN_SESSION",
  "activeSession": {
    "chatId": "uuid-or-null",
    "peerId": "uuid",
    "peerName": "Asha",
    "type": "chat | audio_call | video_call",
    "started": true,
    "requestId": "uuid-or-null"
  }
}
```

`activeSession` can be `null` if it could not be looked up. If you call a listener you already have an unstarted request with (for example the chat request was accepted but no message was sent yet), the old request is replaced instead of returning this error.

#### Other errors

WebSocket errors are emitted via the `error` event:

```javascript
socket.on('error', (data) => {
  console.error('Socket error:', data.message);
});
```

Or returned in callbacks:

```javascript
socket.emit('conversation:create', data, (response) => {
  if (response.error) {
    console.error('Error:', response.error);
  } else {
    console.log('Success:', response);
  }
});
```

---

## 5. Data Models

### User Object

```json
{
  "id": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "mobileNumber": "1234567890",
  "role": "user | listener | astrologer | admin",
  "isActive": true,
  "deviceToken": "fcm_token",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

### Chat Object

```json
{
  "id": "uuid",
  "participant1Id": "uuid",
  "participant2Id": "uuid",
  "lastMessage": "Hello!",
  "lastMessageAt": "2026-01-01T00:00:00.000Z",
  "unreadCount": 5,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "participant1": { /* User object */ },
  "participant2": { /* User object */ }
}
```

### Message Object

```json
{
  "id": "uuid",
  "chatId": "uuid",
  "senderId": "uuid",
  "receiverId": "uuid",
  "content": "Message content or S3 key for media",
  "messageType": "text | image | video | voice",
  "isDelivered": true,
  "isRead": false,
  "readAt": null,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "sender": { /* User object */ }
}
```

### Conversation Object

```json
{
  "id": "uuid",
  "participant1Id": "uuid",
  "participant2Id": "uuid",
  "serviceType": "chat | audio | video",
  "status": "pending | active | completed | cancelled",
  "startedAt": "2026-01-01T00:00:00.000Z",
  "endedAt": null,
  "durationSeconds": 0,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### Transaction Object

```json
{
  "id": "uuid",
  "userId": "uuid",
  "amount": 1000,
  "type": "credit | debit",
  "status": "pending | completed | failed",
  "description": "Payment for conversation",
  "balanceAfter": 5000,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### Pricing Object

```json
{
  "id": "uuid",
  "serviceType": "chat | audio | video",
  "ratePerMinute": 10,
  "isActive": true,
  "effectiveFrom": "2026-01-01T00:00:00.000Z",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

---

## Quick Start Example

### REST API Example

```javascript
// Login with OTP
const response = await fetch('https://api.teachifyy.com/api/auth/verify-otp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    mobileNumber: '1234567890',
    otp: '123456',
    deviceToken: 'fcm_token'
  })
});

const { token, user } = await response.json();

// Use token for authenticated requests
const chatsResponse = await fetch('https://api.teachifyy.com/api/chats', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const { chats } = await chatsResponse.json();
```

### WebSocket Example

```javascript
import io from 'socket.io-client';

// Connect with authentication
const socket = io('https://api.teachifyy.com', {
  auth: {
    token: 'your_jwt_token'
  }
});

// Listen for connection
socket.on('connect', () => {
  console.log('Connected to server');
  
  // Join a chat
  socket.emit('join-chat', {
    chatId: 'chat_uuid',
    receiverId: 'receiver_uuid'
  });
});

// Listen for new messages
socket.on('new-message', (message) => {
  console.log('New message:', message);
  // Update UI with new message
});

// Send a message
socket.emit('send-message', {
  chatId: 'chat_uuid',
  receiverId: 'receiver_uuid',
  content: 'Hello!',
  messageType: 'text'
});

// Handle errors
socket.on('error', (error) => {
  console.error('Socket error:', error.message);
});
```

---

## Support

For questions or issues, contact the backend team or refer to:
- [Balance Validation Guide](./BALANCE_VALIDATION_GUIDE.md)
- [Wallet & Billing Documentation](./WALLET_BILLING_README.md)
- [API Documentation](./API_DOCUMENTATION.md)

---

**End of Documentation**
