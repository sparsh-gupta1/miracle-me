# Balance Validation & Affordable Duration Calculation

## Overview

The system now validates user wallet balance before starting conversations and calculates how many seconds/minutes the user can afford based on the service type pricing.

---

## How It Works

### 1. Balance Validation Flow

```
User wants to start conversation
    ↓
Check user's wallet balance
    ↓
Get pricing for service type (chat/audio_call/video_call)
    ↓
Calculate rate per second (price_per_minute ÷ 60)
    ↓
Calculate affordable duration (balance ÷ rate_per_second)
    ↓
Verify minimum balance (at least 1 minute)
    ↓
Allow/Reject conversation start
```

### 2. Calculation Formula

```javascript
ratePerSecond = pricePerMinute / 60
affordableSeconds = userBalance / ratePerSecond
affordableMinutes = Math.floor(affordableSeconds / 60)
minimumRequired = ratePerSecond × 60  // 1 minute minimum
```

---

## API Usage

### Service Layer

#### Validate Balance Before Starting

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
//   minimumBalanceRequired: 30.00,
//   pricingInfo: { source: "global", pricing_id: null }
// }
```

#### Start Conversation with Automatic Validation

```javascript
// Automatically validates balance before starting
const result = await conversationService.startConversation(conversationId);

console.log(result);
// {
//   conversation: { id, status: "started", startedAt, ... },
//   balanceInfo: {
//     balance: 500.00,
//     affordableSeconds: 1000,
//     affordableMinutes: 16,
//     ...
//   }
// }
```

#### Skip Balance Validation (Optional)

```javascript
// Skip balance check (for testing or special cases)
const result = await conversationService.startConversation(
  conversationId,
  true  // skipBalanceCheck = true
);
```

---

## WebSocket Events

### Client → Server

#### 1. Validate Balance (Before Creating Conversation)

```javascript
socket.emit("conversation:validate_balance", {
  participant2Id: "listener-user-id",
  serviceType: "audio_call"
}, (response) => {
  if (response.success) {
    console.log("Balance Info:", response.balanceInfo);
    // {
    //   balance: 500.00,
    //   affordableMinutes: 16,
    //   hasSufficientBalance: true,
    //   minimumBalanceRequired: 30.00
    // }
    
    if (response.balanceInfo.hasSufficientBalance) {
      // Proceed to create conversation
      alert(`You can talk for ${response.balanceInfo.affordableMinutes} minutes`);
    } else {
      alert(`Insufficient balance! Need ₹${response.balanceInfo.minimumBalanceRequired}`);
    }
  } else {
    console.error("Error:", response.error);
  }
});
```

#### 2. Start Conversation (With Automatic Validation)

```javascript
socket.emit("conversation:start", {
  conversationId: "conversation-id"
}, (response) => {
  if (response.success) {
    console.log("Conversation started!");
    console.log("Affordable duration:", response.balanceInfo.affordableMinutes, "minutes");
    
    // Start timer to track duration
    startCallTimer(response.balanceInfo.affordableSeconds);
  } else {
    // Will fail if insufficient balance
    console.error("Error:", response.error);
    // "Insufficient balance. You have ₹10.00, but need at least ₹30.00 for 1 minute of audio_call"
  }
});
```

### Server → Client

#### Conversation Started Event

```javascript
socket.on("conversation:started", (data) => {
  console.log("Conversation started:", data);
  // {
  //   conversationId: "...",
  //   startedAt: "2026-02-03T18:00:00Z",
  //   status: "started",
  //   balanceInfo: {
  //     affordableSeconds: 1000,
  //     affordableMinutes: 16,
  //     ratePerSecond: 0.50
  //   }
  // }
  
  // Display timer showing affordable duration
  showCallTimer(data.balanceInfo.affordableMinutes);
});
```

---

## Complete Flow Example

### Frontend Implementation

```javascript
// Step 1: Validate balance before showing call UI
async function initiateCall(listenerId, serviceType) {
  return new Promise((resolve, reject) => {
    socket.emit("conversation:validate_balance", {
      participant2Id: listenerId,
      serviceType: serviceType
    }, (response) => {
      if (response.success) {
        const { balanceInfo } = response;
        
        if (!balanceInfo.hasSufficientBalance) {
          reject(new Error(
            `Insufficient balance! You have ₹${balanceInfo.balance.toFixed(2)}, ` +
            `but need ₹${balanceInfo.minimumBalanceRequired.toFixed(2)} for 1 minute.`
          ));
          return;
        }
        
        // Show confirmation dialog
        const confirmed = confirm(
          `Your balance: ₹${balanceInfo.balance.toFixed(2)}\n` +
          `Rate: ₹${balanceInfo.pricePerMinute}/minute\n` +
          `You can talk for: ${balanceInfo.affordableMinutes} minutes\n\n` +
          `Start call?`
        );
        
        if (confirmed) {
          resolve(balanceInfo);
        } else {
          reject(new Error("User cancelled"));
        }
      } else {
        reject(new Error(response.error));
      }
    });
  });
}

// Step 2: Create conversation
async function createAndStartCall(listenerId, serviceType) {
  try {
    // Validate balance first
    const balanceInfo = await initiateCall(listenerId, serviceType);
    
    // Create conversation
    const conversation = await new Promise((resolve, reject) => {
      socket.emit("conversation:create", {
        participant2Id: listenerId,
        serviceType: serviceType
      }, (response) => {
        if (response.success) {
          resolve(response.conversation);
        } else {
          reject(new Error(response.error));
        }
      });
    });
    
    // Start conversation
    const result = await new Promise((resolve, reject) => {
      socket.emit("conversation:start", {
        conversationId: conversation.id
      }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
    
    // Show call UI with timer
    showCallUI({
      conversationId: conversation.id,
      affordableMinutes: result.balanceInfo.affordableMinutes,
      affordableSeconds: result.balanceInfo.affordableSeconds,
      ratePerSecond: result.balanceInfo.ratePerSecond
    });
    
  } catch (error) {
    alert(error.message);
  }
}

// Step 3: Monitor call duration
function showCallUI(callData) {
  let elapsedSeconds = 0;
  const maxSeconds = callData.affordableSeconds;
  
  const timer = setInterval(() => {
    elapsedSeconds++;
    const remainingSeconds = maxSeconds - elapsedSeconds;
    const remainingMinutes = Math.floor(remainingSeconds / 60);
    
    // Update UI
    document.getElementById("timer").textContent = 
      `${remainingMinutes}:${(remainingSeconds % 60).toString().padStart(2, '0')}`;
    
    // Warn when 1 minute left
    if (remainingSeconds === 60) {
      alert("⚠️ Only 1 minute remaining! Please recharge to continue.");
    }
    
    // Auto-end when balance exhausted
    if (remainingSeconds <= 0) {
      clearInterval(timer);
      endCall(callData.conversationId);
      alert("Call ended - Balance exhausted");
    }
  }, 1000);
  
  // Store timer ID for cleanup
  window.callTimer = timer;
}

function endCall(conversationId) {
  if (window.callTimer) {
    clearInterval(window.callTimer);
  }
  
  socket.emit("conversation:end", {
    conversationId: conversationId
  }, (response) => {
    if (response.success) {
      console.log("Call ended. Duration:", response.result.conversation.durationSeconds, "seconds");
      // Show billing summary
      showBillingSummary(response.result);
    }
  });
}
```

---

## Error Handling

### Insufficient Balance Error

```javascript
try {
  await conversationService.startConversation(conversationId);
} catch (error) {
  if (error.message.includes("Insufficient balance")) {
    // Show recharge dialog
    showRechargeDialog();
  }
}
```

### No Pricing Configured Error

```javascript
try {
  const balanceInfo = await conversationService.validateBalanceAndCalculateDuration(
    payerId,
    earnerId,
    "video_call"
  );
} catch (error) {
  if (error.message.includes("No pricing configured")) {
    // Service not available
    alert("This service is currently unavailable");
  }
}
```

---

## Response Examples

### Sufficient Balance

```json
{
  "balance": 500.00,
  "pricePerMinute": 30.00,
  "ratePerSecond": 0.50,
  "affordableSeconds": 1000,
  "affordableMinutes": 16,
  "hasSufficientBalance": true,
  "minimumBalanceRequired": 30.00,
  "pricingInfo": {
    "source": "custom",
    "pricing_id": "pricing-123"
  }
}
```

### Insufficient Balance

```json
{
  "balance": 10.00,
  "pricePerMinute": 30.00,
  "ratePerSecond": 0.50,
  "affordableSeconds": 20,
  "affordableMinutes": 0,
  "hasSufficientBalance": false,
  "minimumBalanceRequired": 30.00,
  "pricingInfo": {
    "source": "global",
    "pricing_id": null
  }
}
```

### Error Response

```json
{
  "error": "Insufficient balance. You have ₹10.00, but need at least ₹30.00 for 1 minute of audio_call"
}
```

---

## Key Features

✅ **Pre-call validation** - Check balance before starting  
✅ **Affordable duration** - Calculate exact seconds/minutes user can afford  
✅ **Minimum balance check** - Ensure at least 1 minute of talk time  
✅ **Real-time calculation** - Based on current pricing and balance  
✅ **Service-specific** - Different rates for chat/audio/video  
✅ **Clear error messages** - User-friendly balance insufficient messages  
✅ **Optional skip** - Can bypass validation for testing/special cases  

---

## Best Practices

1. **Always validate before creating conversation** - Show user affordable duration upfront
2. **Display timer during call** - Show remaining time based on balance
3. **Warn before exhaustion** - Alert when 1-2 minutes remaining
4. **Auto-end on zero balance** - Gracefully end call when balance runs out
5. **Prompt recharge** - Show recharge option when balance is low
6. **Handle pricing changes** - Refresh balance info if pricing updates

---

## Summary

The balance validation system ensures users can only start conversations if they have sufficient wallet balance. It calculates the exact duration they can afford based on per-second billing rates and provides clear feedback about their affordable talk time. This prevents failed billing and improves user experience by setting clear expectations upfront.
