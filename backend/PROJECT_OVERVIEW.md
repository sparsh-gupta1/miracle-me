# Miracle Me Backend - Module Documentation & Logic Reference

This document provides a comprehensive overview of the backend architecture, module-wise logic, and core business flows for the Miracle Me platform.

## 🏗️ High-Level Architecture

The backend is built using **Node.js** with **Express.js**, following a Service-oriented architecture.

- **Framework**: Express.js
- **Database**: PostgreSQL (Managed via Sequelize ORM)
- **Real-time**: WebSocket (ws) + Redis for caching and state management
- **Media Storage**: AWS S3
- **Telecom/RTC**: Agora (for Audio/Video Calling)
- **Logging**: Winston logger for structured logging

---

## 🔐 1. Authentication & User Management
**Module Path**: `src/services/auth.service.js`

### Core Logic:
- **OTP Authentication**: 
    - Users/Listeners sign in via Mobile Number/Email. 
    - The system generates a 4-digit OTP valid for 10 minutes.
    - Currently, for development, the OTP is printed to the console (bypassing external SMS providers).
- **User Roles**: 
    - `user`: Regular consumers of services.
    - `listener`: Service providers with global pricing.
    - `astrologer`: Specialized providers with potential custom pricing.
    - `admin`: Platform managers with full access.
- **Token Management**: Uses JSON Web Tokens (JWT) for session management (Access & Refresh tokens).
- **Wallet Auto-creation**: Every new user automatically gets a wallet initialized during their first login or registration.

---

## 💰 2. Wallet & Transaction System
**Module Path**: `src/services/wallet.service.js`

### Core Logic:
- **Atomic Operations**: All credit/debit operations use Sequelize transactions with **Row-level locking (`FOR UPDATE`)** to prevent race conditions during concurrent billing.
- **Idempotency**: Every transaction check for `referenceId` and `referenceType` to prevent duplicate billing from the same event.
- **Ledger Integration**: Every wallet transaction is mirrored in a `Ledger` table for double-entry bookkeeping transparency.
- **Balance Validation**: Pre-checks are performed before conversations start to ensure users can afford at least 1 minute of service.

---

## 📈 3. Pricing & Commission Engine
**Module Paths**: `src/services/pricing.service.js`, `src/services/commission.service.js`

### Pricing Hierarchy (Effective Pricing):
1. **Astrologer Custom Pricing**: If a practitioner has specific rates set for `chat`, `audio_call`, or `video_call`.
2. **Listener Global Pricing**: Default rates set by Admin for all listeners.
3. **Hardcoded Defaults**: System fallcoded (e.g., Chat: 5, Audio: 10, Video: 15) if nothing is configured in DB.

### Commission Calculation:
- Admin defines commission percentages per `role` and `serviceType`.
- **Net Earning Calculation**: `Gross Amount - (Gross Amount * Commission %) = Net Earning`.

---

## 💳 4. Billing & Conversation Processing
**Module Path**: `src/services/billing.service.js`

### Flow of Conversation Billing:
1. **Duration Check**: Billing only proceeds if `durationSeconds > 0`.
2. **Free Minutes Priority**: The system first checks and consumes any available "Free Minutes" for the user.
3. **Billable Seconds**: Only the remaining duration (Total - Free) is billed at the effective rate.
4. **Capped Billing**: If a user's wallet balance is less than the total bill, the system **caps the charge** at the remaining balance and logs a warning (preventing negative balances).
5. **Daily Earnings**: Practitioners' `DailyEarnings` table is atomically incremented after every billed session.

---

## 📝 5. Chat & Messaging
**Module Path**: `src/services/chat.service.js`

### Logic Breakdown:
- **Media Messaging**: Images, Audio (Voice), and Videos are uploaded to S3. The service generates temporary Base64 data or S3 URLs for the frontend.
- **Unread Counts**: Managed via **Redis** for high-performance reading of conversation lists.
- **Delivery Status**:
    - `isDelivered`: Set true if receiver is online.
    - `isRead`: Set true if receiver is active in the specific chat room.
- **Redis Cache**: Recent messages are cached in Redis to reduce DB load for frequent "recent chats" lookups.

---

## 📞 6. Audio/Video Calling (Agora)
**Module Path**: `src/services/agora.service.js`

### Logic:
- **RTC Token Generation**: Generates temporary Agora RTC tokens using `channelName` (usually the `conversationId`) and `uid` (string user account).
- **Identity Matching**: Uses `buildTokenWithAccount` to ensure full compatibility with string UUIDs, preventing "110" invalid token errors.
- **Channel Authorization**: To ensure secure access, call metadata is stored in Redis under both `call:requestId` and `call:conversationId`.
- **Session Persistence**: Call metadata includes `socket.id` tracking to prevent accidental call termination when a user refreshes their page or disconnects a secondary device.

---

## 🕒 7. Free Minutes System
**Module Path**: `src/services/freeMinutes.service.js`

### Logic:
- **Configurable**: Admin can set different free minute allocations for Chat, Audio, and Video.
- **Initial Grant**: Users get their free minutes auto-initialized upon first use of a service.
- **Consumption Tracking**: Tracks `total_free_seconds`, `consumed_seconds`, and `remaining_seconds` per service type.

---

## 🛠️ Utils & Middlewares
- **`auth.middleware.js`**: Validates JWT and attaches user data to `req.user_data`.
- **`error.middleware.js`**: Centralized error handler with specific handling for Validation, Unauthorized, and Forbidden errors.
- **`s3.service.js`**: Helper for file uploads and signed URL generation.
- **`sms.js`**: (Currently mocked) Logic for sending OTP via SMS providers.

---

*Last Updated: February 15, 2026*
