# Online Status Override — Module Interface Spec

## 1. Current State (as discovered)

| Component | Location | Role |
|-----------|----------|------|
| `users.isOnline` (boolean) | Postgres | Persisted manual override source |
| `user:<id>:status` (Redis hash) | Redis | Live presence: `isOnline`, `socketId`, `lastSeen`, `manualOffine` |
| `POST /users/availability` | `user.controller.js:112` | Updates `isOnline` + Redis sync |
| `GET /users/:userId/status` | `chat.controller.js:253` | Returns Redis status |
| `GET /users/:roleid/search` | `chat.controller.js:273` | Uses Redis status for search list |
| Socket.io disconnect | `config/websocket.js:77` | No-op today |

### Contradictions

1. **Disconnect does not clear presence** — `socket.on("disconnect")` only logs.
2. **Manual offline ignored by socket fallback** — `redisService.getUserStatus()` falls back to `io.in().fetchSockets()` when Redis says offline and `manualOffine` is not true, defeating manual override.
3. **Chat paths OR Redis + socket** — `sendMessageInChat` and `uploadMedia` compute `isOnline` as `redisStatus.isOnline || socketCount > 0`, ignoring manual offline.

---

## 2. Desired State

- **Redis** is the **live presence** source of truth for the current session.
- **Postgres `users.isOnline`** is the **manual override** source of truth, synced to Redis on change.
- **Socket presence** is secondary: it only matters if no manual override is active and Redis has stale/expired data.
- **`manualOffine === "true"` is terminal**: socket fallback is disabled; user is offline for all read paths.

---

## 3. Module Interface: `UserPresence`

### 3.1 Methods

#### `async setUserOnline(userId, socketId)`
Write online state for a connected socket.

**Called by:** socket `connection` handler in `config/websocket.js`.

**Redis:** HSET `user:<id>:status` with `{ isOnline: "true", socketId, lastSeen, manualOffine: "false" }`. EXPIRE 300.

**DB:** No write. DB manual flag is unchanged.

---

#### `async setUserOffline(userId, manualOffline = "false")`
Write offline state on disconnect or manual action.

**Called by:**
- socket `disconnect` handler (`config/websocket.js`) with `manualOffline = "false"`.
- manual API path with `manualOffline = "true"`.

**Redis:** HSET `user:<id>:status` with `{ isOnline: "false", lastSeen, manualOffine }`. HDEL `socketId`. If `manualOffline === "true"`, PERSIST key (no TTL).

**DB:** No write unless explicitly promoted.

---

#### `async setManualUserOnline(userId, socketId?)`
Clear manual offline and restore online.

**Called by:** `POST /users/availability` when `isOnline === true`.

**Redis:** HSET `user:<id>:status` with `{ isOnline: "true", lastSeen, manualOffine: "false" }`. Include `socketId` if provided. EXPIRE 300.

**DB:** Already handled by `UserService.updateAvailability` updating `users.isOnline = true`.

---

#### `async getUserStatus(userId)`
Read presence for status endpoints and list rendering.

**Called by:** `getUserStatusOnline`, `newUserForChat`, and any future list endpoint.

**Return:**
```ts
{
  isOnline: boolean,
  socketId: string | null,
  lastSeen: Date | null,
  manualOffine: boolean
}
```

**Logic:**
1. HGETALL `user:<id>:status`.
2. If key missing or expired: return `{ isOnline: false, ... }` (do not fall back to `io.in().fetchSockets()` unless the feature explicitly requires it and `manualOffine !== true`).
3. If `manualOffine === "true"`: force `isOnline: false` regardless of socket state.
4. Otherwise: trust Redis `isOnline`.

---

#### `async isUserReachable(userId)`
Used by messaging and call routing.

**Called by:** `sendMessageInChat`, `uploadMedia`.

**Return:** `boolean`

**Logic:**
```ts
const status = await redisService.getUserStatus(userId);
return status.isOnline && !status.manualOffine;
```
Do NOT OR with socket count here. Socket fallback belongs inside `getUserStatus` only if Redis key is entirely missing.

---

### 3.2 Data Contract

```
Redis key: user:<uuid>:status
Fields:
  - isOnline: "true" | "false"
  - socketId: string | absent
  - lastSeen: ISO string
  - manualOffine: "true" | "false"

TTL rules:
  - Online / auto-offline: EXPIRE 300
  - Manual offline: PERSIST (infinite) until cleared
```

---

### 3.3 HTTP Contracts

#### `POST /users/availability` (existing, tighten)
**Auth:** `listener`, `astrologer`, `admin`

**Request:**
```json
{
  "isOnline": boolean,
  "isVideoCallAvailable": boolean
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "isOnline": true,
    "isVideoCallAvailable": true
  },
  "message": "Availability updated"
}
```

**Behavior:**
- `isOnline = true` → `UserService.updateAvailability` calls `redisService.setManualUserOnline(userId)`.
- `isOnline = false` → `UserService.updateAvailability` calls `redisService.setUserOffline(userId, "true")`.

---

#### `GET /users/:userId/status` (existing, clarify)
**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "isOnline": true,
    "lastSeen": "2026-08-12T10:00:00.000Z"
  }
}
```

**Behavior:** Returns `redisService.getUserStatus(userId)`. `manualOffine` is internal; do not expose to client unless required.

---

#### `GET /users/:roleid/search` (existing, fix)
Currently returns `isOnline: status.isOnline`. After fix, same field, but `status.isOnline` respects manual override.

---

## 4. Integration Points

| File | Change |
|------|--------|
| `src/config/websocket.js` | Add `redisService.setUserOffline(userId, "false")` in `disconnect` handler. |
| `src/services/redis.service.js` | Remove socket fallback from `getUserStatus`; add `isUserReachable`. |
| `src/controllers/chat.controller.js` | Replace `redisStatus.isOnline \|\| receiverSockets.length > 0` with `redisService.isUserReachable(receiverId)`. |
| `src/services/user.service.js` | `updateAvailability` already syncs Redis; verify it calls the correct method on both true and false. |

---

## 5. Minimal Safe Change Order

1. Add `isUserReachable` to `RedisService`.
2. Update `getUserStatus` to respect `manualOffine` without socket fallback.
3. Wire disconnect cleanup in `config/websocket.js`.
4. Update `chat.controller.js` read paths (`getUserStatusOnline`, `newUserForChat`, `sendMessageInChat`, `uploadMedia`) to use new methods.
5. Verify `POST /users/availability` sync path on both `true` and `false`.

---

## 6. What This Spec Does NOT Cover

- Separate "visible but busy" semantics beyond existing `isBusy` and `isVideoCallAvailable`.
- Background jobs or scheduled presence reconciliation.
- Multi-device socket aggregation (current single `socketId` field).
