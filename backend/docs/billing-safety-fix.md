# Billing Safety Fix - Insufficient Balance Error

## Problem

Users were experiencing "Insufficient balance" errors when calls exceeded the affordable duration:

```
Error: Insufficient balance
    at WalletService.debitWallet
    at BillingService.processConversationBilling
    at ConversationService.endConversation
```

## Root Cause

When a call duration exceeded the pre-calculated affordable duration (due to timing issues, network delays, or monitor failures), the billing service would attempt to charge for the full actual duration, which could exceed the user's available balance.

**Example:**

- User has ₹60 balance
- Affordable duration: 60 seconds at ₹1/second
- Actual call duration: 68 seconds
- Attempted charge: ₹68 → **FAILS** (insufficient balance)

## Solution

Added defensive billing logic in `billing.service.js` that:

1. **Checks wallet balance** before attempting to debit
2. **Caps the charge** at available balance if insufficient
3. **Recalculates billable seconds** based on capped amount
4. **Logs warning** when capping occurs
5. **Marks transaction** with "CAPPED AT BALANCE" note

### Code Changes

**File:** `src/services/billing.service.js`

**Added (lines 223-258):**

```javascript
// DEFENSIVE: Check if payer has sufficient balance
const payerWallet = await walletService.getWalletByUserId(payerId);

let actualBillingAmount = billingData.grossAmount;
let actualBillableSeconds = billableSeconds;
let wasCapped = false;

if (payerWallet.balance < billingData.grossAmount) {
    logger.warn(
        `Insufficient balance for full billing. ` +
        `Required: ${billingData.grossAmount}, Available: ${payerWallet.balance}. ` +
        `Capping charge at available balance.`
    );

    // Cap at available balance
    actualBillingAmount = payerWallet.balance;
    wasCapped = true;

    // Recalculate billable seconds
    const ratePerSecond = pricingInfo.pricePerMinute / 60;
    actualBillableSeconds = Math.floor(actualBillingAmount / ratePerSecond);

    // Recalculate billing data
    const cappedBillingData = await this.calculateBillingAmount(
        serviceType,
        actualBillableSeconds,
        pricingInfo,
        earnerRole
    );

    Object.assign(billingData, cappedBillingData);
}
```

## How It Works Now

**Scenario 1: Normal Call (within affordable duration)**

- User has ₹60, affordable: 60s, actual: 55s
- Charge: ₹55 ✅
- No capping needed

**Scenario 2: Call Exceeds Affordable Duration**

- User has ₹60, affordable: 60s, actual: 68s
- Attempted charge: ₹68
- **Capped to:** ₹60 ✅
- Billable seconds adjusted to 60s
- Transaction marked: "CAPPED AT BALANCE"

## Benefits

1. **No more billing failures** - Calls always complete billing successfully
2. **Fair charging** - Users only charged what they can afford
3. **Audit trail** - Capped transactions are clearly marked
4. **Graceful degradation** - System handles edge cases without errors

## Monitoring

Look for these log messages:

```
WARN: Insufficient balance for full billing. Required: 68, Available: 60. Capping charge at available balance.
```

This indicates the safety mechanism activated.

## Why Calls Still Exceed Duration

The call duration monitor should prevent this, but edge cases exist:

1. **Network delays** - Monitor signal delayed
2. **Server load** - Interval timer skipped
3. **Race conditions** - Call ended before monitor triggered
4. **Monitor failures** - Service errors (non-critical)

This defensive billing ensures the system handles these edge cases gracefully.

## Testing

To verify the fix works:

1. Start a call with limited balance
2. Let it run slightly over affordable duration
3. End the call
4. Check logs for "CAPPED AT BALANCE" message
5. Verify billing succeeded with capped amount

## Related Files

- `src/services/billing.service.js` - Defensive billing logic
- `src/services/callDurationMonitor.service.js` - Primary prevention
- `src/services/wallet.service.js` - Wallet balance checks

## Future Improvements

1. **Stricter monitoring** - Reduce check interval to 500ms
2. **Pre-termination buffer** - End calls at 98% instead of 100%
3. **Client-side enforcement** - Frontend countdown timer
4. **Metrics** - Track how often capping occurs
