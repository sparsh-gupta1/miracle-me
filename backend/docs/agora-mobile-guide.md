# Agora Mobile Frontend Integration Guide (React Native)

## Overview

This guide shows how to integrate Agora RTC SDK into your React Native mobile application for audio and video calls with the Miracle Me backend.

---

## Installation

### 1. Install Dependencies

```bash
npm install react-native-agora
npm install @react-native-async-storage/async-storage
npm install socket.io-client
```

### 2. iOS Setup

```bash
cd ios && pod install && cd ..
```

Add to `ios/Podfile`:

```ruby
platform :ios, '11.0'
```

Add permissions to `ios/YourApp/Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>We need camera access for video calls</string>
<key>NSMicrophoneUsageDescription</key>
<string>We need microphone access for audio calls</string>
```

### 3. Android Setup

Add permissions to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

---

## Quick Start

### 1. Create Call Manager Service

```javascript
// services/CallManager.js
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  IRtcEngineEventHandler,
} from 'react-native-agora';
import io from 'socket.io-client';

class CallManager {
  constructor() {
    this.engine = null;
    this.socket = null;
    this.currentCall = null;
    this.listeners = {};
  }

  // Initialize Agora Engine
  async initialize(appId) {
    try {
      this.engine = createAgoraRtcEngine();
      await this.engine.initialize({ appId });
      
      // Set channel profile
      await this.engine.setChannelProfile(
        ChannelProfileType.ChannelProfileCommunication
      );
      
      // Enable audio and video
      await this.engine.enableAudio();
      await this.engine.enableVideo();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      console.log('Agora engine initialized');
    } catch (error) {
      console.error('Failed to initialize Agora:', error);
      throw error;
    }
  }

  // Setup event handlers
  setupEventHandlers() {
    this.engine.registerEventHandler({
      onJoinChannelSuccess: (connection, elapsed) => {
        console.log('Joined channel successfully');
        this.emit('channelJoined', { connection, elapsed });
      },
      
      onUserJoined: (connection, remoteUid, elapsed) => {
        console.log('Remote user joined:', remoteUid);
        this.emit('userJoined', { remoteUid, elapsed });
      },
      
      onUserOffline: (connection, remoteUid, reason) => {
        console.log('Remote user left:', remoteUid);
        this.emit('userLeft', { remoteUid, reason });
      },
      
      onError: (err, msg) => {
        console.error('Agora error:', err, msg);
        this.emit('error', { err, msg });
      },
      
      onTokenPrivilegeWillExpire: (token) => {
        console.log('Token will expire, renewing...');
        this.renewToken();
      },
    });
  }

  // Setup Socket.IO
  setupSocket(jwtToken, apiUrl) {
    this.socket = io(apiUrl, {
      auth: { token: jwtToken },
    });

    // Incoming call
    this.socket.on('call-request-response', (data) => {
      this.handleIncomingCall(data);
    });

    // Call accepted
    this.socket.on('call-request:accepted', (data) => {
      this.handleCallAccepted(data);
    });

    // Call started
    this.socket.on('call-started', (data) => {
      this.emit('callStarted', data);
    });

    // Call ended
    this.socket.on('call-ended', (data) => {
      // auto_leave: the other side already left. Leave the channel and close the
      // screen right away, without an "end call?" dialog.
      this.endCall();
    });

    // Duration warnings
    this.socket.on('call-duration-warning', (data) => {
      this.emit('durationWarning', data);
    });

    // Auto-ended
    this.socket.on('call-auto-ended', (data) => {
      this.emit('callAutoEnded', data);
      this.endCall();
    });

    console.log('Socket connected');
  }

  // Handle incoming call
  handleIncomingCall(data) {
    this.currentCall = data;
    this.emit('incomingCall', data);
  }

  // Accept call
  async acceptCall() {
    if (!this.currentCall) {
      throw new Error('No active call to accept');
    }

    const { agora, request_id } = this.currentCall;

    if (!agora) {
      throw new Error('Agora not configured on server');
    }

    try {
      // Notify backend
      this.socket.emit('call-request:accept', { request_id });

      // Join Agora channel
      await this.joinChannel(
        agora.token,
        agora.channel,
        agora.uid
      );

      console.log('Call accepted and joined channel');
      this.emit('callAccepted', this.currentCall);

    } catch (error) {
      console.error('Failed to accept call:', error);
      throw error;
    }
  }

  // Join Agora channel
  async joinChannel(token, channelName, uid) {
    try {
      // Set client role to broadcaster
      await this.engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);

      // Join channel
      await this.engine.joinChannel(token, channelName, uid, {
        clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      });

      console.log('Joined channel:', channelName);
    } catch (error) {
      console.error('Failed to join channel:', error);
      throw error;
    }
  }

  // Handle call accepted (caller side)
  handleCallAccepted(data) {
    console.log('Call accepted by receiver');
    this.emit('callAccepted', data);
  }

  // Renew token
  async renewToken() {
    if (!this.currentCall) return;

    try {
      const response = await fetch(`${this.apiUrl}/api/agora/token/renew`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.jwtToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelName: this.currentCall.agora.channel,
          uid: this.currentCall.agora.uid,
        }),
      });

      const { token } = await response.json();
      
      // Update token
      await this.engine.renewToken(token);
      
      console.log('Token renewed successfully');
    } catch (error) {
      console.error('Failed to renew token:', error);
    }
  }

  // Toggle audio
  async toggleAudio() {
    try {
      const isMuted = await this.engine.muteLocalAudioStream(!this.isAudioMuted);
      this.isAudioMuted = !this.isAudioMuted;

      // Notify other user
      this.socket.emit('call-audio-toggle', {
        receiver_id: this.currentCall.senderId || this.currentCall.receiverId,
        request_id: this.currentCall.request_id,
        isMuted: this.isAudioMuted,
      });

      return this.isAudioMuted;
    } catch (error) {
      console.error('Failed to toggle audio:', error);
      throw error;
    }
  }

  // Toggle video
  async toggleVideo() {
    try {
      await this.engine.muteLocalVideoStream(!this.isVideoMuted);
      this.isVideoMuted = !this.isVideoMuted;

      // Notify other user
      this.socket.emit('call-video-toggle', {
        receiver_id: this.currentCall.senderId || this.currentCall.receiverId,
        request_id: this.currentCall.request_id,
        isVideoOff: this.isVideoMuted,
      });

      return this.isVideoMuted;
    } catch (error) {
      console.error('Failed to toggle video:', error);
      throw error;
    }
  }

  // Switch camera
  async switchCamera() {
    try {
      await this.engine.switchCamera();
      console.log('Camera switched');
    } catch (error) {
      console.error('Failed to switch camera:', error);
      throw error;
    }
  }

  // End call
  async endCall() {
    try {
      // Notify backend
      if (this.socket && this.currentCall) {
        this.socket.emit('call-end', {
          receiver_id: this.currentCall.senderId || this.currentCall.receiverId,
          request_id: this.currentCall.request_id,
        });
      }

      // Leave channel
      if (this.engine) {
        await this.engine.leaveChannel();
      }

      // Reset state
      this.currentCall = null;
      this.isAudioMuted = false;
      this.isVideoMuted = false;

      this.emit('callEnded');
      console.log('Call ended');

    } catch (error) {
      console.error('Error ending call:', error);
    }
  }

  // Event emitter
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  // Cleanup
  async destroy() {
    try {
      if (this.engine) {
        await this.engine.leaveChannel();
        this.engine.release();
      }
      if (this.socket) {
        this.socket.disconnect();
      }
    } catch (error) {
      console.error('Error destroying call manager:', error);
    }
  }
}

export default new CallManager();
```

---

## React Native Components

### 1. Call Screen Component

```javascript
// screens/CallScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import {
  RtcSurfaceView,
  VideoViewSetupMode,
} from 'react-native-agora';
import CallManager from '../services/CallManager';

const CallScreen = ({ route, navigation }) => {
  const [remoteUid, setRemoteUid] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    // Setup listeners
    CallManager.on('userJoined', ({ remoteUid }) => {
      setRemoteUid(remoteUid);
    });

    CallManager.on('userLeft', () => {
      setRemoteUid(null);
    });

    CallManager.on('callEnded', () => {
      navigation.goBack();
    });

    CallManager.on('durationWarning', (data) => {
      Alert.alert(
        'Call Time Warning',
        `${data.percentageUsed}% used. ${data.secondsRemaining}s remaining.`
      );
    });

    CallManager.on('callAutoEnded', () => {
      Alert.alert('Call Ended', 'Balance exhausted');
    });

    // Start timer
    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleAudio = async () => {
    try {
      const muted = await CallManager.toggleAudio();
      setIsAudioMuted(muted);
    } catch (error) {
      Alert.alert('Error', 'Failed to toggle audio');
    }
  };

  const handleToggleVideo = async () => {
    try {
      const muted = await CallManager.toggleVideo();
      setIsVideoMuted(muted);
    } catch (error) {
      Alert.alert('Error', 'Failed to toggle video');
    }
  };

  const handleSwitchCamera = async () => {
    try {
      await CallManager.switchCamera();
    } catch (error) {
      Alert.alert('Error', 'Failed to switch camera');
    }
  };

  const handleEndCall = () => {
    CallManager.endCall();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Remote Video */}
      <View style={styles.remoteVideoContainer}>
        {remoteUid ? (
          <RtcSurfaceView
            canvas={{ uid: remoteUid }}
            style={styles.remoteVideo}
          />
        ) : (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>Waiting for other user...</Text>
          </View>
        )}
      </View>

      {/* Local Video */}
      <View style={styles.localVideoContainer}>
        <RtcSurfaceView
          canvas={{ uid: 0, setupMode: VideoViewSetupMode.VideoViewSetupReplace }}
          style={styles.localVideo}
        />
      </View>

      {/* Call Duration */}
      <View style={styles.durationContainer}>
        <Text style={styles.durationText}>{formatDuration(callDuration)}</Text>
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[styles.controlButton, isAudioMuted && styles.mutedButton]}
          onPress={handleToggleAudio}
        >
          <Text style={styles.controlIcon}>
            {isAudioMuted ? '🔇' : '🎤'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, isVideoMuted && styles.mutedButton]}
          onPress={handleToggleVideo}
        >
          <Text style={styles.controlIcon}>
            {isVideoMuted ? '📹' : '📷'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleSwitchCamera}
        >
          <Text style={styles.controlIcon}>🔄</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.endCallButton]}
          onPress={handleEndCall}
        >
          <Text style={styles.controlIcon}>📞</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  remoteVideoContainer: {
    flex: 1,
  },
  remoteVideo: {
    flex: 1,
  },
  waitingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingText: {
    color: '#fff',
    fontSize: 18,
  },
  localVideoContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 120,
    height: 160,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  localVideo: {
    flex: 1,
  },
  durationContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 5,
  },
  durationText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mutedButton: {
    backgroundColor: 'rgba(255,0,0,0.5)',
  },
  endCallButton: {
    backgroundColor: '#ff3b30',
  },
  controlIcon: {
    fontSize: 24,
  },
});

export default CallScreen;
```

### 2. Incoming Call Screen

```javascript
// screens/IncomingCallScreen.js
import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import CallManager from '../services/CallManager';

const IncomingCallScreen = ({ route, navigation }) => {
  const { callData } = route.params;

  const handleAccept = async () => {
    try {
      await CallManager.acceptCall();
      navigation.replace('CallScreen');
    } catch (error) {
      Alert.alert('Error', 'Failed to accept call: ' + error.message);
    }
  };

  const handleReject = () => {
    CallManager.socket.emit('call-request:reject', {
      request_id: callData.request_id,
    });
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.callerName}>{callData.sender_name}</Text>
        <Text style={styles.callType}>
          {callData.request_type === 'video_call' ? 'Video Call' : 'Audio Call'}
        </Text>
        
        {callData.balanceInfo && (
          <Text style={styles.balanceInfo}>
            Available: {callData.balanceInfo.affordableMinutes} minutes
          </Text>
        )}

        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={[styles.button, styles.rejectButton]}
            onPress={handleReject}
          >
            <Text style={styles.buttonText}>Reject</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.acceptButton]}
            onPress={handleAccept}
          >
            <Text style={styles.buttonText}>Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  callerName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  callType: {
    fontSize: 18,
    color: '#aaa',
    marginBottom: 20,
  },
  balanceInfo: {
    fontSize: 16,
    color: '#4CAF50',
    marginBottom: 40,
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    minWidth: 120,
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#ff3b30',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default IncomingCallScreen;
```

---

## App Initialization

```javascript
// App.js
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CallManager from './services/CallManager';
import IncomingCallScreen from './screens/IncomingCallScreen';
import CallScreen from './screens/CallScreen';

const Stack = createNativeStackNavigator();

const App = () => {
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Get Agora App ID from backend
      const response = await fetch('https://api.teachifyy.com/api/agora/config', {
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
        },
      });
      
      const { appId } = await response.json();

      // Initialize Agora
      await CallManager.initialize(appId);

      // Setup Socket
      CallManager.setupSocket(jwtToken, 'https://api.teachifyy.com');

      // Listen for incoming calls
      CallManager.on('incomingCall', (data) => {
        navigation.navigate('IncomingCall', { callData: data });
      });

    } catch (error) {
      console.error('Failed to initialize app:', error);
    }
  };

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen 
          name="IncomingCall" 
          component={IncomingCallScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="CallScreen" 
          component={CallScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
```

---

## Permissions Handling

```javascript
// utils/permissions.js
import { PermissionsAndroid, Platform, Alert } from 'react-native';

export const requestCameraAndAudioPermission = async () => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);

      if (
        granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED
      ) {
        return true;
      } else {
        Alert.alert(
          'Permissions Required',
          'Please grant camera and microphone permissions to make calls'
        );
        return false;
      }
    } catch (err) {
      console.error('Permission error:', err);
      return false;
    }
  }
  return true; // iOS handles permissions automatically
};

// Usage before accepting call
const handleAccept = async () => {
  const hasPermissions = await requestCameraAndAudioPermission();
  if (!hasPermissions) return;
  
  await CallManager.acceptCall();
  navigation.replace('CallScreen');
};
```

---

## Best Practices

### 1. Handle App State Changes

```javascript
import { AppState } from 'react-native';

useEffect(() => {
  const subscription = AppState.addEventListener('change', nextAppState => {
    if (nextAppState === 'background' && CallManager.currentCall) {
      // Optionally end call when app goes to background
      Alert.alert(
        'Call Active',
        'Call will end when app goes to background',
        [
          { text: 'End Call', onPress: () => CallManager.endCall() },
          { text: 'Continue', style: 'cancel' },
        ]
      );
    }
  });

  return () => subscription.remove();
}, []);
```

### 2. Network Quality Indicator

```javascript
// Add to CallManager
setupEventHandlers() {
  this.engine.registerEventHandler({
    // ... existing handlers
    
    onNetworkQuality: (connection, remoteUid, txQuality, rxQuality) => {
      this.emit('networkQuality', { txQuality, rxQuality });
    },
  });
}

// In CallScreen
const [networkQuality, setNetworkQuality] = useState('good');

useEffect(() => {
  CallManager.on('networkQuality', ({ txQuality, rxQuality }) => {
    if (txQuality > 3 || rxQuality > 3) {
      setNetworkQuality('poor');
    } else {
      setNetworkQuality('good');
    }
  });
}, []);
```

### 3. Error Recovery

```javascript
CallManager.on('error', ({ err, msg }) => {
  console.error('Agora error:', err, msg);
  
  if (err === 17) { // Token expired
    Alert.alert('Session Expired', 'Please try calling again');
    CallManager.endCall();
  }
});
```

---

## Testing

### Test Checklist

- [ ] Install app on physical device (emulator may not work well)
- [ ] Grant camera and microphone permissions
- [ ] Test incoming call notification
- [ ] Test accepting call
- [ ] Test rejecting call
- [ ] Test audio toggle
- [ ] Test video toggle
- [ ] Test camera switch
- [ ] Test ending call
- [ ] Test network quality indicators
- [ ] Test token renewal
- [ ] Test call duration warnings
- [ ] Test auto-termination

---

## Troubleshooting

### Issue: Black screen on video

**Solution:**

- Check camera permissions
- Verify video is enabled in Agora engine
- Test on physical device (not emulator)

### Issue: No audio

**Solution:**

- Check microphone permissions
- Verify audio is enabled
- Check device volume settings

### Issue: Can't join channel

**Solution:**

- Verify token is valid
- Check network connectivity
- Ensure Agora App ID is correct

---

## Production Checklist

- [ ] Test on both iOS and Android
- [ ] Test on different devices
- [ ] Test with poor network conditions
- [ ] Add analytics tracking
- [ ] Add crash reporting
- [ ] Optimize battery usage
- [ ] Add call quality feedback
- [ ] Test background behavior
- [ ] Add push notifications for incoming calls

---

## Resources

- [React Native Agora Documentation](https://docs.agora.io/en/video-calling/get-started/get-started-sdk?platform=react-native)
- [API Reference](https://api-ref.agora.io/en/video-sdk/reactnative/4.x/API/rtc_api_overview.html)
- [Sample Apps](https://github.com/AgoraIO-Community/Agora-RN-Quickstart)
