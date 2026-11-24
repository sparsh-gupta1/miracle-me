# Miracle Me - Admin Panel API & Socket Documentation

This document provides technical details for the Miracle Me Admin Panel integration.

> **Base URL:** `https://api.teachifyy.com/api` (Production) | `http://localhost:3000/api` (Development)  
> **WebSocket URL:** Same as base URL (Socket.io connects to root `/`)

---

## 1. Authentication (Admin)

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| `POST` | `/auth/admin-login` | Admin login with email/password | `{ "email": "admin@example.com", "password": "..." }` | `{ "success": true, "token": "jwt_token", "user": {...} }` |
| `PUT` | `/auth/logout` | Logout current admin | - | `{ "success": true, "message": "Logged out" }` |

---

## 2. User Management (Admin Only)

**Base Path:** `/api/user`

| Method | Endpoint | Description | Request Body / Params | Response |
|--------|----------|-------------|----------------------|----------|
| `GET` | `/:roleid/admin-panel` | Get users by role (1:Admin, 2:Listener, 3:User, 4:Astrologer) | URL Param: `roleid`. Query: see *User list query params* below | `{ "success": true, "data": { "users": [...], "total": 100, "page": 1, "limit": 10 } }` |
| `PATCH` | `/:userid/active-status` | Activate or deactivate a user account. Deactivating also logs the user out of all devices. | URL Param: `userid`, Body: `{ "isActive": true/false }` | `{ "success": true, "user": {...} }` |
| `POST` | `/:userid/force-logout` | **Log a user out of all devices.** Revokes every token they hold, clears their push token (listeners go offline) and disconnects their live sockets. They can log in again normally. | URL Param: `userid` | `{ "success": true, "message": "User logged out from all devices", "data": { "userId": "...", "role": "user", "disconnectedSockets": 1 } }`. Returns `404` for an unknown user. |
| `POST` | `/create` | Create a new user (Listener/Astrologer/Admin) | `multipart/form-data` — see details below | `{ "success": true, "user": {...} }` |
| `PATCH` | `/:userid/profile` | **Edit an existing listener/astrologer profile** | `multipart/form-data` — see details below | `{ "success": true, "data": {...} }` |
| `DELETE` | `/:userid` | Delete a user (soft or permanent) | Body: `{ "deletionType": "soft" \| "permanent" }` | `{ "success": true, "data": {...} }` |

### What a logged-out client sees

After a force logout (or deactivation), the user's apps see three things:
- **HTTP:** any request with an old token returns `401` with the body `{ "message": "You have been logged out. Please log in again.", "code": "SESSION_REVOKED" }`. Apps should clear their stored tokens and show the login screen.
- **Socket:** open connections first receive `auth:force-logout` with `{ "reason": "logged_out_by_admin" }` and are then disconnected. Reconnecting with the old token fails.
- **Refresh:** a refresh token issued before the logout is rejected.

### User list query params (`GET /:roleid/admin-panel`)

All params are optional. An invalid value returns `400` with `{ "message": "..." }`.

| Param | Values | Default | Description |
|-------|--------|---------|-------------|
| `page` | integer ≥ 1 | `1` | Page number |
| `limit` | 1–100 | `10` | Page size |
| `search` | text | — | Matches name or mobile number |
| `sortBy` | `createdAt`, `name`, `lastLogin`, `rating`, `age` | `createdAt` | Sort field. Users with no value (never logged in, no rating, no age) always come last. |
| `order` | `asc`, `desc` | `desc` | Sort direction |
| `hasRecharged` | `true`, `false` | — (all) | `true` returns users with at least one **completed** recharge. `false` returns users who never recharged; failed or pending attempts don't count. |

Example: `GET /api/user/3/admin-panel?hasRecharged=true&sortBy=lastLogin&order=desc&page=1&limit=20`

### `PATCH /:userid/profile` — Edit Listener / Astrologer Profile

> **Auth:** Admin JWT (Bearer token)  
> **Content-Type:** `multipart/form-data`  
> All fields are **optional** — send only what needs to change. At least one field must be provided.

| Field | Type | Description |
|-------|------|-------------|
| `fullName` | `string` | Display name of the user |
| `mobileNumber` | `string` | 10–15 digit phone number |
| `age` | `number` | Age (1–120) |
| `language` | `JSON array` (string) | e.g. `["Hindi","English"]` |
| `profile` | `JSON object` (string) | Partial profile data, merged into existing |
| `profileImage` | `file` | JPEG / PNG / GIF / WEBP, max 5 MB |

**Example Request (multipart/form-data):**
```
PATCH /api/user/abc-123/profile
Authorization: Bearer <admin_token>

fullName    = "Ananya Sharma"
age         = 27
language    = ["Hindi","English"]
profileImage = <file>
```

**Example Response:**
```json
{
  "success": true,
  "message": "User profile updated",
  "data": {
    "id": "abc-123",
    "name": "Ananya Sharma",
    "age": 27,
    "language": ["Hindi", "English"],
    "profileImage": "https://s3.amazonaws.com/...signed-url...",
    "role": "listener",
    "isActive": true
  }
}
```

**Error Responses:**

| Status | Message |
|--------|---------|
| `400` | `"At least one field must be provided to update"` |
| `400` | `"Mobile number must be between 10-15 digits"` |
| `400` | `"Invalid file format ... Allowed formats: JPEG, PNG, GIF, WEBP"` |
| `403` | `"Access restricted."` (non-admin caller) |
| `404` | `"User not found"` |

---

## 3. Pricing Management (Global Pricing)

**Base Path:** `/api/pricing`

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| `POST` | `/listener` | Create global pricing for listeners | `{ "serviceType": "chat", "pricePerMinute": 10, "effectiveFrom": "2026-02-12" }` | `{ "success": true, "pricing": {...} }` |
| `PUT` | `/listener/:pricingId` | Update or toggle global pricing | `{ "pricePerMinute": 15, "isActive": true }` | `{ "success": true, "pricing": {...} }` |
| `GET` | `/listener` | Get all global pricing configurations | - | `{ "success": true, "pricing": [...] }` |
| `GET` | `/listener/:serviceType/history` | Get pricing change history for a service | URL Param: `serviceType` | `{ "success": true, "history": [...] }` |

---

## 4. Transaction & Finance

**Base Path:** `/api/transactions`

| Method | Endpoint | Description | Request Body / Params | Response |
|--------|----------|-------------|----------------------|----------|
| `GET` | `/` | Get ALL system transactions (Paginated) | Query: `page`, `limit` | `{ "success": true, "transactions": [...], "totalCount": 500 }` |

---

## 5. Free Minutes Configuration

**Base Path:** `/api/free-minutes`

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|--------------|----------|
| `POST` | `/` | Set free minutes for a service type | `{ "serviceType": "audio_call", "freeMinutes": 5 }` | `{ "success": true, "config": {...} }` |
| `GET` | `/` | Get all free minutes configs | - | `{ "success": true, "configs": [...] }` |
| `DELETE` | `/:serviceType` | Disable free minutes for a service | URL Param: `serviceType` | `{ "success": true }` |

---

## 6. WebSocket Events (Admin Control)

**Authentication:** Pass Admin JWT token in connection options as `token`.

### Withdrawal Management

| Event Name | Payload | Callback/Response | Description |
|------------|---------|-------------------|-------------|
| `withdrawal:get_pending` | `{ "pagination": { "page": 1, "limit": 20 } }` | `withdrawal:pending_res` | Fetch all pending withdrawal requests |
| `withdrawal:approve` | `{ "requestId": "..." }` | `withdrawal:approve_res` | Approve a withdrawal request |
| `withdrawal:reject` | `{ "requestId": "...", "reason": "..." }` | `withdrawal:reject_res` | Reject a withdrawal request |
| `withdrawal:subscribe` | - | `withdrawal:subscription_res`| Subscribe to real-time withdrawal events |

### Server → Client Events (Listeners)

| Event Name | Payload | Description |
|------------|---------|-------------|
| `withdrawal:new_request` | `{ "requestId": "...", "userId": "...", "amount": 500 }` | Broadcasted to all admins when a new request is made |
| `withdrawal:status_updated` | `{ "requestId": "...", "status": "approved" }` | Notifies admins when a request status changes |

---

## 7. Dashboard (Admin Only)
**Base path:** `/api/dashboard`

Every endpoint takes optional `from` / `to` ISO dates (`to` is exclusive). The default is the last 30 days, and a range can be at most one year. Money is in INR, rounded to 2 decimals. Day, week and month buckets use IST (`Asia/Kolkata`). All responses use the shape `{ "success": true, "data": { ... } }`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/overview` | KPI cards. Each card is `{ value, previousPeriodValue, changePct }`. The previous period is a window of the same length just before `from`. |
| `GET` | `/trends?metric=&interval=day\|week\|month` | Chart series with zero-filled buckets. |
| `GET` | `/sessions` | Billed sessions by service type: minutes, free minutes, spend and commission. |
| `GET` | `/requests` | Chat/call request funnel: accepted, rejected, missed, cancelled, acceptance and miss rates, average time to accept. |
| `GET` | `/practitioners/top?sortBy=earnings\|minutes\|conversations\|rating&role=listener\|astrologer&limit=10` | Listener/astrologer leaderboard with earnings, minutes, penalties and miss rate. |
| `GET` | `/finance` | Recharges, spend, commission, listener earnings, platform net, penalties, withdrawals (approved and pending) and current wallet balances. |

**`/overview` sections**
- `users`: `newUsers`, `newListeners`, `newAstrologers`, `newTotal`, `activeUsers` (by `lastLogin`), `totals` (all-time count by role plus `deleted`), and `live` (online, busy and available listeners/astrologers right now).
- `revenue`: `rechargeRevenue`, `rechargeCount`, `payingUsers`, `arppu`, `rechargeSuccessRate`, `grossSpend`, `commission`, `listenerEarnings`, `platformNet`, `penalties`.
- `activity`: `sessions`, `talkMinutes`, `freeMinutesUsed`.
- `withdrawals.pending` and `wallets` (`userBalance` is prepaid money users can still spend; `earningBalance` is money owed to practitioners) are snapshots of the current state.

**Trend metrics:** `new_users` (split by role), `recharge_revenue`, `gross_spend`, `commission`, `listener_earnings`, `sessions` and `talk_minutes` (both split by service type). Each point looks like `{ "bucket": "2026-10-01", "<series>": 12, "total": 12 }`.

**Definitions**
- *Gross spend* is what payers were charged for sessions.
- *Listener earnings* is what was credited to earners' earning wallets.
- *Platform net* is gross spend minus listener earnings. It can be negative when free minutes are subsidised.
- *Recharge revenue* is the sum of completed payment-gateway transactions.

---

## 8. Server Logs (Admin Only)
**Base path:** `/api/logs`

These endpoints read the winston log files in `logs/`. Only `.log` files that exist in that folder can be read, so a path like `../.env` returns 404. JWTs inside log messages are replaced with `[REDACTED_JWT]`.

**Daily files and retention:** the logger writes one file per day for each stream: `combined-YYYY-MM-DD.log` (all levels) and `error-YYYY-MM-DD.log` (errors only). Files older than **14 days** are deleted automatically. The older undated `combined.log` and `error.log` are legacy files. Auto-cleanup ignores them, but admins can delete them.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | List log files as `[{ name, type, date, size, modifiedAt, active }]`, sorted by type and then newest date first. `active` marks the file currently being written (the newest dated file of each type). `date` is `null` for legacy files. |
| `GET` | `/:file?limit=200&cursor=&level=&search=` | Entries, newest first. `limit` is 1–1000. `level` is one of `error`, `warn`, `info`, `http`, `verbose`, `debug`. `search` is case-insensitive. |
| `GET` | `/:file/follow?after=&level=&search=` | Entries written after byte offset `after`, oldest first, for live tailing. |
| `GET` | `/:file/download` | Download the whole file. |
| `DELETE` | `/:file` | Delete one log file. Returns `409` for an `active` file: clear it instead. |
| `POST` | `/:file/clear` | Empty a file (works on the active file too). Returns `{ name, freedBytes }`. |
| `DELETE` | `/?olderThanDays=14` | Delete every inactive file older than N days (1–365, required). Dated files use the date in their name; legacy files use their last-modified time. Returns `{ cutoff, deleted: [names], freedBytes }`. |

Each delete or clear writes a `warn` line to the log recording the admin's ID and what was removed.

**Paging older entries:** pass the returned `nextCursor` as `cursor`. `nextCursor` is `null` once the start of the file is reached. A single request scans at most 8 MB; when it stops before the start of the file, `scanLimitReached` is `true`. Keep paging with `nextCursor` to continue.

**Live tail:** take `endCursor` from the first read and poll `/follow?after=<endCursor>` every few seconds, each time using the new `endCursor` from the response. Show new entries at the top. If `reset` is `true`, the file was truncated: reload from the start.

**Entry shape**
```json
{ "offset": 6880525, "timestamp": "2026-10-09 15:24:27", "level": "error", "message": "Something failed\n  more lines", "truncated": false }
```
A message can span several lines (multi-line logs are grouped into one entry), so render it with `white-space: pre-wrap`. Messages longer than 20,000 characters are cut off and have `truncated: true`.

---

## Support

The Admin Panel uses role-based access control. Ensure the user logged in via `/api/auth/admin-login` has the `admin` role (Role ID: 1) to access these endpoints.
