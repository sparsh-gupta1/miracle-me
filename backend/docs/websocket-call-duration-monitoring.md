# Call Duration Monitoring - New WebSocket Events

This document describes the new WebSocket events added for real-time call duration monitoring and enforcement.

## Overview

The call duration monitoring system tracks active calls in real-time and automatically terminates them when the user's affordable duration is reached. Users receive warnings at 90% and 95% of their limit.

## Client Events (Received by Clients)

### `call-duration-warning`

Emitted to both call participants when approaching the affordable duration limit.

**Trigger Points:**

- At 90% of affordable duration
- At 95% of affordable duration

**Payload:**

```javascript
{
  request_id: string,          // Call request ID
  conversationId: string,      // Conversation ID
  percentageUsed: number,      // 90 or 95
  secondsRemaining: number,    // Seconds left before auto-termination
  message: string              // "You have X seconds remaining"
}
```

**Example:**

```javascript
socket.on('call-duration-warning', (data) => {
  console.log(`Warning: ${data.message}`);
  // Show warning toast to user
  showWarning(data.message, data.secondsRemaining);
});
```

---

### `call-auto-ended`

Emitted to both call participants when a call is automatically terminated due to balance exhaustion.

**Payload:**

```javascript
{
  request_id: string,          // Call request ID
  conversationId: string,      // Conversation ID
  reason: 'balance_exhausted', // Termination reason
  durationSeconds: number,     // Total call duration
  message: string              // "Call ended: Balance exhausted"
}
```

**Example:**

```javascript
socket.on('call-auto-ended', (data) => {
  console.log(`Call ended: ${data.message}`);
  // Show notification and clean up UI
  showNotification(data.message);
  endCallUI();
});
```

**Note:** The standard `call-ended` event is also emitted for backward compatibility.

---

## Implementation Details

### Monitoring Lifecycle

1. **Start Monitoring**: When a call is accepted (`call-request:accept`)
   - System calculates affordable duration based on user's balance
   - Starts a 1-second interval timer
   - Stores call metadata in Redis

2. **During Call**: Every second
   - Checks elapsed time vs affordable duration
   - Sends warnings at 90% and 95%
   - Auto-terminates at 100%

3. **Stop Monitoring**: When call ends
   - Manual end via `call-end` event
   - User disconnect
   - Auto-termination at limit

### Redis Data Structure

```
Key: call-monitor:{request_id}
{
  conversationId: string,
  senderId: string,
  receiverId: string,
  startTime: ISO timestamp,
  affordableSeconds: number,
  warningsSent: ['90', '95'],  // Array of sent warnings
  status: 'monitoring' | 'ended'
}
```

### Affordable Duration Calculation

The affordable duration includes:

- **Free minutes**: Promotional/free minutes available to the user
- **Paid minutes**: Minutes affordable with current wallet balance

Formula:

```javascript
affordableSeconds = freeSecondsRemaining + (walletBalance / ratePerSecond)
```

---

## Frontend Integration Guide

### 1. Listen for Warnings

```javascript
socket.on('call-duration-warning', (data) => {
  if (data.percentageUsed === 90) {
    // First warning - show subtle notification
    showToast(`${data.secondsRemaining}s remaining`, 'warning');
  } else if (data.percentageUsed === 95) {
    // Final warning - show prominent alert
    showAlert(`Call ending soon! ${data.secondsRemaining}s left`, 'danger');
  }
});
```

### 2. Handle Auto-Termination

```javascript
socket.on('call-auto-ended', (data) => {
  // Clean up call UI
  endCallUI();
  
  // Show notification
  showNotification(
    'Call ended: Balance exhausted',
    'Your call was ended because your balance ran out.'
  );
  
  // Optionally redirect to recharge page
  if (confirm('Would you like to add balance?')) {
    redirectToRecharge();
  }
});
```

### 3. Display Remaining Time (Optional)

You can poll the monitoring status to show a countdown timer:

```javascript
// Note: This requires implementing a status endpoint
setInterval(async () => {
  const status = await fetch(`/api/calls/${requestId}/monitor-status`);
  const data = await status.json();
  
  if (data.secondsRemaining) {
    updateCallTimer(data.secondsRemaining);
  }
}, 5000); // Update every 5 seconds
```

---

## Testing

### Test Scenario 1: Warning Notifications

```javascript
// User with 60 seconds affordable duration
// Expected warnings:
// - At 54s elapsed (90%): "You have 6 seconds remaining"
// - At 57s elapsed (95%): "You have 3 seconds remaining"
// - At 60s elapsed: Auto-termination
```

### Test Scenario 2: Manual End Before Limit

```javascript
// User with 120 seconds affordable duration
// Manual end at 30 seconds
// Expected: No warnings, normal billing for 30s
```

### Test Scenario 3: Disconnect During Call

```javascript
// User disconnects at 45s of 60s affordable
// Expected: Monitor stops, billing for 45s
```

---

## Error Handling

### Monitor Fails to Start

If the monitor fails to start (e.g., Redis connection issue), the call will continue without monitoring. This is logged but non-critical.

```javascript
// Log example
logger.error("Failed to start call duration monitoring:", error);
// Call continues without monitoring
```

### Auto-Termination Fails

If auto-termination fails (e.g., conversation service error), the monitor will stop but the call may continue. The billing system will handle this gracefully by capping charges at the affordable amount.

---

## Migration Notes

### Backward Compatibility

- Existing `call-ended` event is still emitted
- Clients not listening for new events will continue to work
- No breaking changes to existing API

### Recommended Updates

1. Add listeners for `call-duration-warning` and `call-auto-ended`
2. Display warning notifications to improve UX
3. Handle auto-termination gracefully with user-friendly messages
