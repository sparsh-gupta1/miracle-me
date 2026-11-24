# Test Suite Documentation

## Overview

Comprehensive test suite for the wallet, billing, commission, conversation, and withdrawal system.

## Test Structure

```
tests/
├── setup.js                          # Global test configuration
├── unit/
│   └── services/
│       ├── wallet.service.test.js          # Wallet operations tests
│       ├── billing.service.test.js         # Billing calculations tests
│       ├── conversation.service.test.js    # Conversation lifecycle tests
│       ├── withdrawal.service.test.js      # Withdrawal workflow tests
│       └── commission.service.test.js      # Commission management tests
└── integration/
    └── wallet-billing-flow.test.js         # End-to-end flow test
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run specific test file
```bash
npm test -- wallet.service.test.js
```

### Run with coverage
```bash
npm test -- --coverage
```

### Run in watch mode
```bash
npm test -- --watch
```

### Run integration tests only
```bash
npm test -- tests/integration
```

### Run unit tests only
```bash
npm test -- tests/unit
```

## Test Coverage

### Wallet Service Tests (wallet.service.test.js)
- ✅ Create wallet
- ✅ Get wallet by user ID
- ✅ Get wallet balance
- ✅ Credit wallet (with idempotency)
- ✅ Debit wallet (with idempotency)
- ✅ Validate sufficient balance
- ✅ Get wallet transactions (with filters)
- ✅ Get wallet statistics
- ✅ Concurrent operations safety
- ✅ Ledger entry creation

**Total Test Cases: 15**

### Billing Service Tests (billing.service.test.js)
- ✅ Calculate rate per second
- ✅ Calculate billing amounts
- ✅ Process conversation billing
- ✅ Create communication charge
- ✅ Update daily earnings
- ✅ Get billing history
- ✅ Get daily earnings
- ✅ Handle zero duration conversations
- ✅ Prevent duplicate billing (idempotency)
- ✅ Commission calculation integration

**Total Test Cases: 14**

### Conversation Service Tests (conversation.service.test.js)
- ✅ Create conversation
- ✅ Start conversation
- ✅ End conversation
- ✅ Calculate duration
- ✅ Trigger billing on end
- ✅ Get conversation details
- ✅ Get user conversations (with filters)
- ✅ Get active conversations
- ✅ Get conversation statistics
- ✅ Prevent duplicate active conversations
- ✅ Consistent participant ordering

**Total Test Cases: 13**

### Withdrawal Service Tests (withdrawal.service.test.js)
- ✅ Create withdrawal rule
- ✅ Update withdrawal rule
- ✅ Get current withdrawal rule
- ✅ Get all withdrawal rules
- ✅ Validate withdrawal request
- ✅ Create withdrawal request
- ✅ Approve withdrawal
- ✅ Reject withdrawal
- ✅ Get user withdrawals (with filters)
- ✅ Get pending withdrawals (admin)
- ✅ Get withdrawal statistics
- ✅ Validation: minimum amount
- ✅ Validation: allowed days
- ✅ Validation: sufficient balance
- ✅ Validation: pending request check

**Total Test Cases: 16**

### Commission Service Tests (commission.service.test.js)
- ✅ Create commission rule
- ✅ Update commission rule
- ✅ Get commission rules (with filters)
- ✅ Get current commission
- ✅ Calculate commission
- ✅ Get all current commissions
- ✅ Handle zero commission
- ✅ Decimal precision handling
- ✅ Historical tracking

**Total Test Cases: 12**

### Integration Tests (wallet-billing-flow.test.js)
- ✅ Complete conversation flow
  - Wallet recharge
  - Conversation creation
  - Conversation start
  - Conversation end
  - Automatic billing
  - Daily earnings update
- ✅ Complete withdrawal flow
  - Withdrawal request creation
  - Validation
  - Admin approval
  - Balance deduction
- ✅ Transaction history verification
- ✅ Final balance integrity check

**Total Test Cases: 10**

## Total Test Cases: 80+

## Key Testing Features

### 1. Idempotency Testing
All financial operations are tested for idempotency:
- Duplicate credit/debit operations
- Duplicate billing processing
- Duplicate withdrawal approvals

### 2. Concurrency Testing
Tests verify thread-safety:
- Concurrent wallet credits
- Row-level locking verification

### 3. Edge Cases
- Zero duration conversations
- Insufficient balance scenarios
- Invalid withdrawal days
- Missing commission rules
- Duplicate requests

### 4. Data Integrity
- Balance calculations
- Ledger entry creation
- Transaction history accuracy
- Daily earnings aggregation

### 5. Error Handling
- Not found scenarios
- Invalid state transitions
- Validation failures
- Constraint violations

## Test Data Cleanup

All tests properly clean up test data:
- `beforeAll`: Create test fixtures
- `afterAll`: Delete test data and close connections
- `beforeEach`/`afterEach`: Per-test cleanup when needed

## Mocking

Tests use Jest mocking for:
- Pricing service (to avoid external dependencies)
- Time-dependent operations (for consistent results)

## Assertions

Tests verify:
- Return values and types
- Database state changes
- Balance calculations
- Transaction records
- Ledger entries
- Error messages

## Example Test Output

```
PASS tests/unit/services/wallet.service.test.js
  Wallet Service
    createWallet
      ✓ should create a new wallet for a user (45ms)
      ✓ should return existing wallet if already created (12ms)
    creditWallet
      ✓ should credit wallet and create transaction record (67ms)
      ✓ should be idempotent - prevent duplicate transactions (34ms)
      ✓ should handle concurrent credit operations safely (123ms)
    debitWallet
      ✓ should debit wallet and create transaction record (56ms)
      ✓ should throw error if insufficient balance (23ms)

PASS tests/integration/wallet-billing-flow.test.js
  End-to-End Wallet & Billing Flow
    Complete Conversation & Billing Flow
      ✓ Step 1: Payer recharges wallet (78ms)
      ✓ Step 2: Listener wallet is created (34ms)
      ✓ Step 3: Create and start conversation (45ms)
      ✓ Step 4: Simulate conversation duration (2003ms)
      ✓ Step 5: End conversation and process billing (156ms)
      ✓ Step 6: Verify daily earnings updated (23ms)
    Complete Withdrawal Flow
      ✓ Step 1: Listener creates withdrawal request (45ms)
      ✓ Step 2: Validate withdrawal request (12ms)
      ✓ Step 3: Admin approves withdrawal (89ms)

Test Suites: 6 passed, 6 total
Tests:       80 passed, 80 total
Snapshots:   0 total
Time:        15.234s
```

## Coverage Goals

- **Branches**: 70%+
- **Functions**: 70%+
- **Lines**: 70%+
- **Statements**: 70%+

## Best Practices

1. **Isolation**: Each test is independent
2. **Cleanup**: Proper data cleanup after tests
3. **Descriptive**: Clear test names and assertions
4. **Fast**: Tests run quickly (< 30s total)
5. **Reliable**: No flaky tests
6. **Comprehensive**: Cover happy paths and edge cases

## Continuous Integration

Tests are designed to run in CI/CD pipelines:
- No external dependencies required
- Database transactions for isolation
- Consistent test data
- Predictable execution time

## Next Steps

1. Add controller/route integration tests
2. Add WebSocket event tests
3. Add load/performance tests
4. Increase coverage to 80%+
5. Add mutation testing
