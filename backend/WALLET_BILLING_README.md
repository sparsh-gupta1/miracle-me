# Wallet & Billing System

A comprehensive wallet, billing, commission, conversation lifecycle, and withdrawal management system for the miracle-me-backend application.

## 🎯 Features

- **Wallet Management** - User wallets with credit/debit operations
- **Per-Second Billing** - Accurate conversation billing with per-second rate calculation
- **Balance Validation** - Pre-call balance check with affordable duration calculation
- **Commission System** - Configurable commission rules per role and service type
- **Conversation Lifecycle** - Complete conversation management (create → start → end → bill)
- **Withdrawal Workflow** - User withdrawal requests with admin approval
- **Real-Time Events** - WebSocket integration for live updates
- **Audit Trail** - Double-entry bookkeeping via ledger system
- **Idempotency** - Safe retry mechanism for all financial operations
- **Atomic Operations** - Database transactions ensure data integrity


---

## 📦 Database Models

### Core Wallet Models
- **Wallet** - User wallet with balance tracking
- **WalletTransaction** - Immutable transaction records (credit/debit)
- **Ledger** - Double-entry bookkeeping for audit trail

### Billing & Commission
- **CommunicationCharge** - Billing records after conversation ends
- **Commission** - Commission rules per role and service type
- **DailyEarnings** - Aggregated daily earnings summary

### Withdrawal
- **WithdrawalRule** - Admin-configurable withdrawal rules
- **WithdrawalRequest** - User withdrawal requests with approval workflow

### Extended
- **Chat** - Extended with conversation lifecycle fields (`serviceType`, `status`, `startedAt`, `endedAt`, `durationSeconds`)

---

## 🚀 Getting Started

### Run Migrations

```bash
npx sequelize-cli db:migrate
```

### Run Tests

```bash
# All tests
npm test

# With coverage
npm test -- --coverage

# Integration tests only
npm test -- tests/integration

# Unit tests only
npm test -- tests/unit
```

---

## 💡 Usage Examples

### Balance Validation (Pre-Call Check)

```javascript
const conversationService = require('./src/services/conversation.service');

// Check if user can afford the conversation
const balanceInfo = await conversationService.validateBalanceAndCalculateDuration(
  payerId,        // User who will pay
  earnerId,       // Listener/Astrologer who will earn
  "audio_call"    // Service type
);

console.log(balanceInfo);
// {
//   balance: 500.00,
//   pricePerMinute: 30.00,
//   ratePerSecond: 0.50,
//   affordableSeconds: 1000,
//   affordableMinutes: 16,
//   hasSufficientBalance: true,
//   minimumBalanceRequired: 30.00
// }

if (!balanceInfo.hasSufficientBalance) {
  throw new Error(`Insufficient balance! Need ₹${balanceInfo.minimumBalanceRequired}`);
}

// Show user: "You can talk for 16 minutes"
```

### Complete Conversation Flow

```javascript
const conversationService = require('./src/services/conversation.service');

// 1. Create conversation
const conversation = await conversationService.createConversation(
  userId1,
  userId2,
  "audio_call"
);

// 2. Start conversation (automatically validates balance)
const result = await conversationService.startConversation(conversation.id);
// Returns: { conversation, balanceInfo: { affordableMinutes: 16, ... } }

// 3. ... conversation happens ...

// 4. End conversation (triggers billing automatically)
const endResult = await conversationService.endConversation(conversation.id);

// Result includes:
// - conversation (with duration)
// - billing (with payer/earner transactions)
// - Wallet balances updated
// - Daily earnings updated
// - WebSocket events emitted
```

### Wallet Operations

```javascript
const walletService = require('./src/services/wallet.service');

// Create wallet
await walletService.createWallet(userId);

// Credit wallet
await walletService.creditWallet(
  userId,
  1000.0,
  "recharge",
  "recharge-001",
  "Wallet recharge"
);

// Debit wallet
await walletService.debitWallet(
  userId,
  500.0,
  "withdrawal",
  "withdrawal-001",
  "Withdrawal approved"
);

// Get balance
const balance = await walletService.getWalletBalance(userId);
```

### Withdrawal Flow

```javascript
const withdrawalService = require('./src/services/withdrawal.service');

// 1. User creates withdrawal request
const request = await withdrawalService.createWithdrawalRequest(userId, 500);

// 2. Admin approves
const result = await withdrawalService.approveWithdrawal(request.id, adminId);

// Result includes:
// - Updated withdrawal request (status: approved)
// - Wallet transaction (debit)
// - WebSocket events emitted to user and admins
```

---

## 🔧 Services

### Wallet Service
- `createWallet(userId)` - Create wallet for user
- `creditWallet(userId, amount, referenceType, referenceId, description)` - Add funds
- `debitWallet(userId, amount, referenceType, referenceId, description)` - Deduct funds
- `getWalletBalance(userId)` - Get current balance
- `getWalletTransactions(userId, filters, pagination)` - Transaction history
- `validateSufficientBalance(userId, amount)` - Balance check

### Billing Service
- `calculateBillingAmount(serviceType, durationSeconds, pricingInfo, userRole)` - Calculate amounts
- `processConversationBilling(conversationId)` - Process billing after conversation ends
- `getBillingHistory(userId, filters, pagination)` - Get billing history
- `getDailyEarnings(userId, filters, pagination)` - Get daily earnings

**Billing Formula:**
```javascript
ratePerSecond = pricePerMinute / 60
grossAmount = durationSeconds × ratePerSecond
commissionAmount = grossAmount × (commissionPercentage / 100)
netEarning = grossAmount - commissionAmount
```

### Conversation Service
- `validateBalanceAndCalculateDuration(payerId, earnerId, serviceType)` - Check balance & calculate affordable duration
- `createConversation(participant1Id, participant2Id, serviceType)` - Create conversation
- `startConversation(conversationId, skipBalanceCheck)` - Start conversation with automatic balance validation
- `endConversation(conversationId)` - End conversation + trigger billing
- `getConversationDetails(conversationId)` - Get conversation with participants
- `getUserConversations(userId, filters, pagination)` - Get user's conversations
- `getActiveConversations(userId)` - Get active conversations

### Commission Service
- `createCommissionRule(data, adminId)` - Create commission rule
- `getCurrentCommission(role, serviceType)` - Get active commission rate
- `calculateCommission(grossAmount, role, serviceType)` - Calculate commission amount
- `getCommissionRules(role, serviceType)` - Get commission history

### Withdrawal Service
- `createWithdrawalRule(data, adminId)` - Create withdrawal rule
- `validateWithdrawalRequest(userId, amount)` - Validate request
- `createWithdrawalRequest(userId, amount)` - Create request
- `approveWithdrawal(requestId, adminId)` - Approve + debit wallet
- `rejectWithdrawal(requestId, adminId, reason)` - Reject request
- `getUserWithdrawals(userId, filters, pagination)` - Get user's withdrawals
- `getPendingWithdrawals(pagination)` - Get pending withdrawals (admin)

---

## 🔌 WebSocket Events

### Conversation Events
- `conversation:validate_balance` - Validate balance before starting (returns affordable duration)
- `conversation:create` - Create new conversation
- `conversation:start` - Start conversation (includes balance info in response)
- `conversation:end` - End conversation + emit billing updates
- `conversation:join` - Join conversation room
- `conversation:leave` - Leave conversation room

**Emitted:**
- `conversation:created`, `conversation:started` (with balanceInfo), `conversation:ended`
- `wallet:balance_updated` (after billing)

### Wallet Events
- `wallet:get_balance` - Get current balance
- `wallet:get_transactions` - Get transaction history
- `wallet:subscribe` - Subscribe to wallet updates

**Emitted:**
- `wallet:balance_updated` - Balance changed
- `wallet:transaction_created` - New transaction

### Withdrawal Events
- `withdrawal:create` - Create withdrawal request
- `withdrawal:approve` - Approve withdrawal (admin)
- `withdrawal:reject` - Reject withdrawal (admin)

**Emitted:**
- `withdrawal:status_updated`, `withdrawal:approved`, `withdrawal:rejected`
- `wallet:balance_updated` (after approval)

---

## ✅ Key Features

### Decimal-Safe Money Calculations
- `DECIMAL(15, 2)` for wallet balances
- `DECIMAL(20, 6)` for per-second rates
- No floating-point arithmetic

### Atomic Operations
- All wallet operations wrapped in Sequelize transactions
- Rollback on any error
- Row-level locking for concurrency safety

### Idempotency
- Wallet transactions use `referenceType` + `referenceId`
- Prevents duplicate transactions
- Safe for retries

### Immutability
- WalletTransaction, Ledger, CommunicationCharge are immutable
- No `updatedAt` field on immutable models
- Historical data preserved

### Real-Time Events
- WebSocket events for all critical operations
- Room-based event scoping
- Automatic wallet balance updates after billing

### Balance Validation
- Pre-call balance check before starting conversations
- Calculate affordable duration based on pricing
- Minimum balance requirement (1 minute)
- Clear error messages for insufficient balance
- Real-time balance info during conversation start

---

## 🧪 Testing

The system includes **80+ comprehensive test cases**:

- **Unit Tests** - All services fully tested
  - `wallet.service.test.js` (15 tests)
  - `billing.service.test.js` (14 tests)
  - `conversation.service.test.js` (13 tests)
  - `withdrawal.service.test.js` (16 tests)
  - `commission.service.test.js` (12 tests)

- **Integration Tests** - End-to-end flow
  - `wallet-billing-flow.test.js` (10 tests)

**Coverage Goals:** 70%+ (branches, functions, lines, statements)

See [tests/README.md](tests/README.md) for detailed test documentation.

---

## 📁 Project Structure

```
src/
├── models/
│   ├── wallet.model.js
│   ├── walletTransaction.model.js
│   ├── ledger.model.js
│   ├── communicationCharge.model.js
│   ├── commission.model.js
│   ├── dailyEarnings.model.js
│   ├── withdrawalRule.model.js
│   └── withdrawalRequest.model.js
├── services/
│   ├── wallet.service.js
│   ├── billing.service.js
│   ├── commission.service.js
│   ├── conversation.service.js
│   └── withdrawal.service.js
├── websocket/
│   └── handlers/
│       ├── conversation.handler.js
│       ├── wallet.handler.js
│       └── withdrawal.handler.js
└── migrations/
    ├── 20260203175409-create-wallets-table.js
    ├── 20260203175410-create-wallet-transactions-table.js
    ├── 20260203175411-create-ledger-table.js
    ├── 20260203175412-update-chats-add-conversation-fields.js
    ├── 20260203175413-create-communication-charges-table.js
    ├── 20260203175414-create-commissions-table.js
    ├── 20260203175415-create-daily-earnings-table.js
    ├── 20260203175416-create-withdrawal-rules-table.js
    └── 20260203175417-create-withdrawal-requests-table.js
```

---

## 🔜 Next Steps

### Phase 4: Controllers & Routes
- Create REST API controllers for all services
- Define routes and integrate with Express
- Add request/response validation

### Phase 6: Validation & Security
- Add Joi validation schemas
- Implement role-based middleware
- Add API rate limiting

---

## 📝 Summary

Production-ready wallet and billing system with:
- ✅ Atomic financial operations
- ✅ Per-second billing calculations
- ✅ Pre-call balance validation with affordable duration
- ✅ Commission management
- ✅ Withdrawal workflow
- ✅ Real-time WebSocket events
- ✅ Complete audit trail via ledger
- ✅ Idempotent and safe for retries
- ✅ Comprehensive test coverage (80+ tests)

All core functionality is in place and fully tested. Remaining work includes controllers, routes, and additional validation.

**See also:** [BALANCE_VALIDATION_GUIDE.md](BALANCE_VALIDATION_GUIDE.md) for detailed balance validation documentation.

---

## 📄 License

ISC

## 👤 Author

Miracle Me Backend Team
