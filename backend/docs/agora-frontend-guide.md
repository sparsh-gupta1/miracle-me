# Agora Frontend Integration Guide

## Overview

This guide shows how to integrate Agora RTC SDK into your frontend for audio and video calls with the Miracle Me backend.

---

## Installation

```bash
npm install agora-rtc-sdk-ng
```

---

## Quick Start

### 1. Initialize Agora Client

```javascript
import AgoraRTC from 'agora-rtc-sdk-ng';

// Create Agora client
const client = AgoraRTC.createClient({
  mode: 'rtc',
  codec: 'vp8'
});

// Store local tracks
let localAudioTrack = null;
let localVideoTrack = null;
```

### 2. Listen for Call Request

```javascript
socket.on('call-request-response', async (data) => {
  const { agora, conversationId, balanceInfo } = data;
  
  // Check if Agora is configured
  if (!agora) {
    console.warn('Agora not configured on server');
    // Fall back to alternative calling method
    return;
  }
  
  // Store Agora data for when user accepts
  window.currentCallData = {
    agora,
    conversationId,
    balanceInfo
  };
  
  // Show incoming call UI
  showIncomingCallUI(data);
});
```

### 3. Accept Call and Join Channel

```javascript
async function acceptCall() {
  const { agora, conversationId } = window.currentCallData;
  
  try {
    // Emit accept event to backend
    socket.emit('call-request:accept', {
      request_id: currentRequestId
    });
    
    // Join Agora channel
    await client.join(
      agora.appId,
      agora.channel,
      agora.token,
      agora.uid
    );
    
    console.log('Joined Agora channel:', agora.channel);
    
    // Create and publish local tracks
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    localVideoTrack = await AgoraRTC.createCameraVideoTrack();
    
    // Publish tracks
    await client.publish([localAudioTrack, localVideoTrack]);
    
    // Play local video
    localVideoTrack.play('local-video-container');
    
    console.log('Published local tracks');
    
  } catch (error) {
    console.error('Failed to join call:', error);
    alert('Failed to join call: ' + error.message);
  }
}
```

### 4. Handle Remote Users

```javascript
// Subscribe to remote users
client.on('user-published', async (user, mediaType) => {
  await client.subscribe(user, mediaType);
  console.log('Subscribed to remote user:', user.uid, mediaType);
  
  if (mediaType === 'video') {
    const remoteVideoTrack = user.videoTrack;
    remoteVideoTrack.play('remote-video-container');
  }
  
  if (mediaType === 'audio') {
    const remoteAudioTrack = user.audioTrack;
    remoteAudioTrack.play();
  }
});

// Handle user unpublished
client.on('user-unpublished', (user, mediaType) => {
  console.log('Remote user unpublished:', user.uid, mediaType);
  
  if (mediaType === 'video') {
    // Remove video element
    const container = document.getElementById('remote-video-container');
    container.innerHTML = '';
  }
});

// Handle user left
client.on('user-left', (user) => {
  console.log('Remote user left:', user.uid);
  // Clean up UI
});
```

### 5. Handle Token Renewal

```javascript
// Token will expire soon
client.on('token-privilege-will-expire', async () => {
  console.log('Token will expire, renewing...');
  
  try {
    const response = await fetch('/api/agora/token/renew', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channelName: currentChannelName,
        uid: currentUid
      })
    });
    
    const { token } = await response.json();
    await client.renewToken(token);
    
    console.log('Token renewed successfully');
  } catch (error) {
    console.error('Failed to renew token:', error);
  }
});

// Token expired (shouldn't happen if renewal works)
client.on('token-privilege-did-expire', () => {
  console.error('Token expired! Leaving channel...');
  leaveCall();
});
```

### 6. End Call

```javascript
async function endCall() {
  try {
    // Emit call-end to backend
    socket.emit('call-end', {
      receiver_id: otherUserId,
      request_id: currentRequestId
    });
    
    // Unpublish and close local tracks
    if (localAudioTrack) {
      localAudioTrack.close();
      localAudioTrack = null;
    }
    
    if (localVideoTrack) {
      localVideoTrack.close();
      localVideoTrack = null;
    }
    
    // Leave Agora channel
    await client.leave();
    
    console.log('Left Agora channel');
    
    // Clean up UI
    cleanupCallUI();
    
  } catch (error) {
    console.error('Error ending call:', error);
  }
}
```

---

## Complete Example

```javascript
import AgoraRTC from 'agora-rtc-sdk-ng';
import io from 'socket.io-client';

class CallManager {
  constructor() {
    this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    this.localAudioTrack = null;
    this.localVideoTrack = null;
    this.currentCall = null;
    this.socket = null;
    
    this.setupAgoraListeners();
  }
  
  setupAgoraListeners() {
    // Remote user published
    this.client.on('user-published', async (user, mediaType) => {
      await this.client.subscribe(user, mediaType);
      
      if (mediaType === 'video') {
        user.videoTrack.play('remote-video');
      }
      
      if (mediaType === 'audio') {
        user.audioTrack.play();
      }
    });
    
    // Token renewal
    this.client.on('token-privilege-will-expire', () => {
      this.renewToken();
    });
    
    // User left
    this.client.on('user-left', (user) => {
      console.log('User left:', user.uid);
    });
  }
  
  setupSocketListeners(socket) {
    this.socket = socket;
    
    // Incoming call
    socket.on('call-request-response', (data) => {
      this.handleIncomingCall(data);
    });
    
    // Call accepted
    socket.on('call-request:accepted', (data) => {
      this.handleCallAccepted(data);
    });
    
    // Call ended
    socket.on('call-ended', () => {
      this.endCall();
    });
    
    // Duration warnings
    socket.on('call-duration-warning', (data) => {
      this.showWarning(data);
    });
    
    // Auto-ended
    socket.on('call-auto-ended', (data) => {
      this.handleAutoEnd(data);
    });
  }
  
  handleIncomingCall(data) {
    this.currentCall = data;
    // Show incoming call UI
    this.showIncomingCallUI(data);
  }
  
  async acceptCall() {
    const { agora, request_id } = this.currentCall;
    
    if (!agora) {
      alert('Agora not configured');
      return;
    }
    
    try {
      // Notify backend
      this.socket.emit('call-request:accept', { request_id });
      
      // Join channel
      await this.client.join(
        agora.appId,
        agora.channel,
        agora.token,
        agora.uid
      );
      
      // Create tracks
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      this.localVideoTrack = await AgoraRTC.createCameraVideoTrack();
      
      // Publish
      await this.client.publish([this.localAudioTrack, this.localVideoTrack]);
      
      // Play local video
      this.localVideoTrack.play('local-video');
      
      console.log('Call accepted and joined');
      
    } catch (error) {
      console.error('Failed to accept call:', error);
      alert('Failed to join call');
    }
  }
  
  async handleCallAccepted(data) {
    // Caller side - call was accepted
    console.log('Call accepted by receiver');
  }
  
  async renewToken() {
    try {
      const response = await fetch('/api/agora/token/renew', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.jwtToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channelName: this.currentCall.agora.channel,
          uid: this.currentCall.agora.uid
        })
      });
      
      const { token } = await response.json();
      await this.client.renewToken(token);
      
    } catch (error) {
      console.error('Failed to renew token:', error);
    }
  }
  
  async toggleAudio() {
    if (this.localAudioTrack) {
      const isMuted = this.localAudioTrack.muted;
      await this.localAudioTrack.setMuted(!isMuted);
      
      // Notify other user
      this.socket.emit('call-audio-toggle', {
        receiver_id: this.currentCall.senderId,
        request_id: this.currentCall.request_id,
        isMuted: !isMuted
      });
      
      return !isMuted;
    }
  }
  
  async toggleVideo() {
    if (this.localVideoTrack) {
      const isOff = this.localVideoTrack.muted;
      await this.localVideoTrack.setMuted(!isOff);
      
      // Notify other user
      this.socket.emit('call-video-toggle', {
        receiver_id: this.currentCall.senderId,
        request_id: this.currentCall.request_id,
        isVideoOff: !isOff
      });
      
      return !isOff;
    }
  }
  
  showWarning(data) {
    const { percentageUsed, secondsRemaining } = data;
    alert(`Warning: ${percentageUsed}% of call time used. ${secondsRemaining}s remaining.`);
  }
  
  handleAutoEnd(data) {
    alert('Call ended: Balance exhausted');
    this.endCall();
  }
  
  async endCall() {
    try {
      // Notify backend
      if (this.socket && this.currentCall) {
        this.socket.emit('call-end', {
          receiver_id: this.currentCall.senderId || this.currentCall.receiverId,
          request_id: this.currentCall.request_id
        });
      }
      
      // Close tracks
      if (this.localAudioTrack) {
        this.localAudioTrack.close();
        this.localAudioTrack = null;
      }
      
      if (this.localVideoTrack) {
        this.localVideoTrack.close();
        this.localVideoTrack = null;
      }
      
      // Leave channel
      await this.client.leave();
      
      // Clean up
      this.currentCall = null;
      
      console.log('Call ended');
      
    } catch (error) {
      console.error('Error ending call:', error);
    }
  }
}

// Usage
const callManager = new CallManager();
const socket = io('https://api.teachifyy.com', {
  auth: { token: jwtToken }
});
callManager.setupSocketListeners(socket);
```

---

## UI Components

### Incoming Call UI

```html
<div id="incoming-call" style="display: none;">
  <h3>Incoming Call from <span id="caller-name"></span></h3>
  <p>Balance: <span id="call-balance"></span> minutes</p>
  <button onclick="callManager.acceptCall()">Accept</button>
  <button onclick="rejectCall()">Reject</button>
</div>
```

### Active Call UI

```html
<div id="active-call" style="display: none;">
  <div id="local-video-container"></div>
  <div id="remote-video-container"></div>
  
  <div id="call-controls">
    <button onclick="callManager.toggleAudio()">
      <span id="audio-icon">🎤</span>
    </button>
    <button onclick="callManager.toggleVideo()">
      <span id="video-icon">📹</span>
    </button>
    <button onclick="callManager.endCall()">
      End Call
    </button>
  </div>
  
  <div id="call-timer">00:00</div>
</div>
```

---

## Best Practices

### 1. Error Handling

```javascript
try {
  await client.join(...);
} catch (error) {
  if (error.code === 'INVALID_TOKEN') {
    // Token expired or invalid
    alert('Session expired. Please try again.');
  } else if (error.code === 'UID_CONFLICT') {
    // User already in channel
    alert('You are already in a call.');
  } else {
    alert('Failed to join call: ' + error.message);
  }
}
```

### 2. Device Permissions

```javascript
async function checkPermissions() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    return true;
  } catch (error) {
    alert('Please allow camera and microphone access');
    return false;
  }
}

// Call before accepting
if (await checkPermissions()) {
  await callManager.acceptCall();
}
```

### 3. Network Quality Monitoring

```javascript
client.on('network-quality', (stats) => {
  console.log('Network quality:', stats.uplinkNetworkQuality, stats.downlinkNetworkQuality);
  
  if (stats.uplinkNetworkQuality > 3) {
    showNetworkWarning('Poor network quality');
  }
});
```

### 4. Cleanup on Page Unload

```javascript
window.addEventListener('beforeunload', () => {
  if (callManager.currentCall) {
    callManager.endCall();
  }
});
```

---

## Troubleshooting

### Token Errors

**Problem:** `INVALID_TOKEN` error

**Solution:**

- Check that App ID matches
- Verify token hasn't expired
- Ensure UID matches authenticated user

### No Video/Audio

**Problem:** Can't see/hear remote user

**Solution:**

- Check `user-published` event is firing
- Verify subscription succeeded
- Check browser permissions
- Test with different browser

### Connection Issues

**Problem:** Can't join channel

**Solution:**

- Check network connectivity
- Verify Agora App ID is correct
- Check firewall settings
- Try different region

---

## Next Steps

1. **Test locally** - Start with audio-only calls
2. **Add video** - Enable camera after audio works
3. **UI polish** - Add proper call screens
4. **Error handling** - Handle all edge cases
5. **Production testing** - Test with real users

---

## Resources

- [Agora Web SDK Documentation](https://docs.agora.io/en/video-calling/get-started/get-started-sdk)
- [API Reference](https://api-ref.agora.io/en/video-sdk/web/4.x/index.html)
- [Sample Code](https://github.com/AgoraIO/API-Examples-Web)
