# Miracle Me Backend API & Socket Documentation

This documentation covers the REST API endpoints and Real-time Socket.io events for the Miracle Me backend.

## 1. REST API

**Base URL**: `/api`

### Authentication (`/auth`)
| Method | Endpoint | Description | Body / Params |
| :--- | :--- | :--- | :--- |
| `POST` | `/request-otp` | Request OTP for login/signup | `{ "mobileNumber": "1234567890", "role": "user" }` |
| `POST` | `/verify-otp` | Verify OTP | `{ "mobileNumber": "...", "otp": "123456", "deviceToken": "..." }` |
| `POST` | `/google` | Google Authentication | `{ "token": "GOOGLE_ID_TOKEN", "role": "user" }` |
| `POST` | `/admin-login` | Admin Login | `{ "email": "...", "password": "..." }` |
| `POST` | `/listener-login` | Listener Login | `{ "email": "...", "password": "..." }` |
| `PUT` | `/logout` | Logout (Requires Auth) | - |

### User (`/user`) - *Requires Auth*
| Method | Endpoint | Description | Body / Params |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Get current user profile | - |
| `GET` | `/:userId/status` | Get specific user's online status | URL Param: `userId` |
| `GET` | `/:roleid/search` | Search users to start chat | URL Param: `roleid` |
| `POST` | `/change-name` | Change Name (Restricted Roles) | `{ "chatId": "...", "name": "New Name" }` |
| `POST` | `/block-user` | Block a user | `{ "userId": "..." }` |
| `GET` | `/block-user` | Get list of blocked users | - |
| `GET` | `/receiver-profile/:receiverId` | Get profile of chat receiver | URL Param: `receiverId` |

### Chat (`/chats`) - *Requires Auth*
| Method | Endpoint | Description | Body / Params |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Get all active chats | Query: `page`, `limit` |
| `POST` | `/` | Create or Get existing chat | `{ "receiverId": "..." }` |
| `GET` | `/:chatId/messages` | Get messages for a chat | URL Param: `chatId`. Query: `page`, `limit` |
| `POST` | `/:chatId/messages` | Send Message (HTTP Fallback) | `{ "receiverId": "...", "content": "..." }` |
| `POST` | `/media` | **Upload Media & Send Message** | Form-Data: `file`, `chatId`, `receiverId` |
| `PATCH` | `/:chatId/read` | Mark messages as read | URL Param: `chatId` |
| `DELETE` | `/messages/:messageId` | Delete a message | URL Param: `messageId` |
| `GET` | `/:chatId/search` | Search messages in chat | Query: `q` (query string) |
| `GET` | `/unread-counts` | Get total unread count | - |

### Documents (`/documents`) - *Requires Auth*
| Method | Endpoint | Description | Body / Params |
| :--- | :--- | :--- | :--- |
| `POST` | `/upload` | Upload Single Document | Form-Data: `file` |
| `POST` | `/upload-multiple` | Upload Multiple Docs | Form-Data: `files` (array) |
| `GET` | `/` | Get all user documents | - |
| `GET` | `/download/:key` | Get S3 Download URL | URL Param: `key` |
| `DELETE` | `/:key` | Delete Document | URL Param: `key` |

### Payments & Transactions
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/payments/order` | Create Payment Order |
| `POST` | `/payments/verify` | Verify Payment Signature |
| `GET` | `/transactions/my` | Get My Transactions |
| `POST` | `/transactions/:id/refund` | Initiate Refund |

---

## 2. WebSocket Events (Socket.io)

**Connection**:
*   Connect to default namespace `/`.
*   **Auth**: Pass JWT in `auth.token`.

### Client -> Server (Events you EMIT)

| Event Name | Payload | Description |
| :--- | :--- | :--- |
| `join-chat` | `{ "chatId": "...", "receiverId": "..." }` | Join a specific chat room to receive real-time messages. |
| `leave-chat` | `{ "chatId": "..." }` | Leave the chat room. |
| `send-message` | `{ "chatId": "...", "receiverId": "...", "content": "...", "messageType": "text" }` | Send a text message. (For media, use API `/api/chats/media`). |
| `load-messages` | `{ "chatId": "...", "page": 1, "limit": 50 }` | Load older messages (Pagination). |
| `typing-start` | `{ "chatId": "..." }` | Notify other user you are typing. |
| `typing-stop` | `{ "chatId": "..." }` | Notify other user you stopped typing. |
| `delete-message`| `{ "chatId": "...", "messageId": "..." }` | Delete a message for both users. |
| `search-messages`| `{ "chatId": "...", "query": "..." }` | Search text within the chat currently open. |
| `get-chats` | `{ "page": 1, "limit": 20 }` | Request the list of user's chats. |
| `user-online` | `{}` | Signal that the user is actively using the app (Triggers delivery checks). |
| `check-video-call-status` | `{ "receiverId": "..." }` | Check if a user is currently in a video call. |
| `user-manual-status` | `{ "status": "online" \| "offline" }` | (Listeners only) Manually toggle availability. |

### Server -> Client (Events you LISTEN for)

| Event Name | Payload Structure | Description |
| :--- | :--- | :--- |
| `new-message` | `{ "id": "...", "content": "...", "sender": "me" | "them", ... }` | **Main Message Event**. Received when a message is sent to you or by you. |
| `new-message-notification` | `{ "chatId": "...", "senderName": "...", "content": "..." }` | Received when you are **online but NOT in the chat room**. Use this to show a toast/badge. |
| `user-status-changed` | `{ "userId": "...", "isOnline": true/false, "lastSeen": "..." }` | Real-time online/offline status updates of other users. |
| `chat-joined` | `{ "chatId": "...", "messages": [...] }` | Confirmation of joining chat. contains recent messages. |
| `messages-loaded` | `{ "chatId": "...", "messages": [...], "hasMore": bool }` | Result of `load-messages`. |
| `message-delivered` | `{ "messageId": "...", "deliveredAt": "..." }` | Confirmation that your message reached the other user. |
| `messages-read` | `{ "chatId": "...", "messageIds": [...] }` | Notification that the other user read your messages. |
| `user-typing` | `{ "userId": "...", "isTyping": true/false }` | Real-time typing indicator. |
| `message-deleted` | `{ "messageId": "...", "deletedBy": "..." }` | A message was deleted. Remove it from UI. |
| `chats-loaded` | `{ "chats": [...] }` | List of chats (Recent conversations). |
| `video-call-status` | `{ "isVideoCall": true/false }` | Result of video call check. |
