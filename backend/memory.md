# Miracle Me Backend — Memory

## Stack
- Node.js + Express 5 + CommonJS
- PostgreSQL via Sequelize 6
- Redis for cache/unread counts/session state
- Socket.IO for real-time events
- AWS S3 for media uploads
- Agora for audio/video RTC tokens
- Firebase Admin for push notifications
- Razorpay for payment integrations
- Joi for validation, Winston for logging, Jest + Supertest for testing

## Auth
- OTP-based sign-in (mobile/email)
- JWT access + refresh tokens
- Firebase is initialized but auth is mostly custom JWT-based

## Money Flow
- Wallet model tracks balances
- WalletTransaction is immutable; Ledger mirrors every transaction
- Billing formula: ratePerSecond × durationSeconds → gross → commission → netEarning
- DailyEarnings accumulates provider earnings
- WithdrawalRequests use approve/reject workflow with rules
- FreeMinutes service grants and consumes promotional minutes before billing

## Key Domain Models
- User, Wallet, WalletTransaction, Ledger
- Chat, Message, ChatParticipant, ChatSetting
- CallRequest, UserMetadata, UserBlocklist, UserFavorite
- CommunicationCharge, Commission, DailyEarnings
- WithdrawalRule, WithdrawalRequest
- Announcement, Transaction
- ListenerGlobalPricing, AstrologerCustomPricing
- FreeMinutesConfig, UserFreeMinutesUsage

## Important Paths
- Entry: `src/server.js`
- Middleware: `src/middlewares/*`
- Core business logic: `src/services/*`
- REST routes: `src/routes/*`
- Real-time: `src/websocket/*`

## Recent Work Context
- Branch: `fix/base64-multipart`
- Recent commits include CORS middleware changes, JSON body limit increase to 13MB for webhooks, websocket formatting fixes
- Current focus is on webhook/multipart handling stability

## Docs
- `PROJECT_OVERVIEW.md` covers architecture and module logic
- `WALLET_BILLING_README.md` documents financial flows
- `BALANCE_VALIDATION_GUIDE.md` explains pre-call balance checks
- `FRONTEND_API_DOCUMENTATION.md` and `ADMIN_PANEL_API_DOCUMENTATION.md` describe endpoints
