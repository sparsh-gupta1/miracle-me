# Miracle Me — demo app API

## Run
```
docker run -d --name miracle-pg -e POSTGRES_USER=miracle -e POSTGRES_PASSWORD=miracle -e POSTGRES_DB=miracle -p 5433:5432 postgres:16-alpine
docker run -d --name miracle-redis -p 6390:6379 redis:7-alpine
npx sequelize-cli db:migrate --url postgres://miracle:miracle@127.0.0.1:5433/miracle   # use migrations, NOT DB_SYNC (model sync breaks on enum order)
npm run seed:demo                       # idempotent
nohup node src/server.js > /tmp/backend.log 2>&1 &     # :4000
node scripts/demo-expert.js 9000000001 [--reject] [--delay=4]   # expert simulator
```
`.env` (see `.env.example`): DB_* → 127.0.0.1:5433 miracle/miracle/miracle, REDIS_PORT=6390, DB_SYNC=false, ENABLE_SMS=false, **DEMO_MODE=true** (demo top-up, relaxed auth rate limit), **DEMO_OTP=1234** (every number accepts OTP 1234, no SMS).
Firebase/Agora/Razorpay "not configured" warnings at boot are harmless.

Seed: customer **9999999999** (₹150, has 2 past sessions + 1 thread), experts 9000000001..8 (Keshav, Ramesh, Priya[listener], Sunita[busy], Dr. Lakshmi[offline], Rohan[listener], Meera[listener], Devendra). Free minutes: chat 5 / audio 3 / video 2 (shared pool is consumed across services).

## Conventions
Success: `{ "success": true, "data": … }`. Errors: `{ "message": "…", "errors": [...] }` with HTTP 400/401/404 (no `success` key). Auth header `Authorization: Bearer <accessToken>`.

## Auth
- `POST /api/auth/request-otp {mobileNumber}` → `{success, message, userId, isNewUser}` (NOT enveloped in `data`)
- `POST /api/auth/verify-otp {uuid: userId, otp:"1234"}` → `{ user:{id,role,name,mobileNumber,…}, tokens:{accessToken, refreshToken} }` (no `success`/`data` wrapper). Access token 30d.
- `POST /api/auth/refresh {refreshToken}` → `{success, data:{tokens:{accessToken,refreshToken}}}` (added)
- `PUT /api/auth/logout`
Experts log in the same way (role comes back in `user.role`: `astrologer`/`listener`/`user`).

## REST
- `GET /api/user/me` / `PATCH /api/user/me {name?, gender? female|male|other, dateOfBirth? yyyy-MM-dd, birthTime? HH:mm, birthPlace?}` → `{id, role, name, mobileNumber, gender, dateOfBirth, birthTime, birthPlace}`
- `GET /api/wallet` → `{balance}`; `POST /api/wallet/demo-topup {amount 1..10000}` → `{balance}` (404 unless DEMO_MODE=true)
- `GET /api/experts?kind&q&onlineOnly&minRating&minPrice&maxPrice&language&gender&minExperience&maxExperience&favouritesOnly&page&limit` → `{experts:[ExpertDTO], totalCount, hasMore}`; `maxPrice/minPrice` compare the chat price.
  ExpertDTO: `{id,name,role,headline,specialty,rating,reviewCount,languages[],gender,experienceYears,status:"online|busy|offline",isFavorite,profileImage,pricing:{chat,audio,video|null}}`
- `GET /api/experts/:id` → ExpertDTO + `{about, specialities[], featuredReview:{author,when,text,rating}|null, freeMinutes:{chat,audio,video}}`
- `GET /api/experts/:id/quote?service=chat|audio|video` → `{service, pricePerMinute, balance, freeMinutes, talkMinutes, hasSufficientBalance, rechargeAmount}` (400 for video when expert has no video)
- Favourite toggle (existing): `POST /api/user/favorites {favoriteUserId}` → `{isFavorite}`
- `GET /api/sessions` → `{active:[{id,serviceType,expert,startedAt,elapsedSeconds,remainingSeconds}], threads:[{chatId,expert,lastMessage,lastMessageAt,unreadCount}], past:[{id,serviceType,expert,durationMinutes,endedAt}]}`. A chat only becomes `active` after the first message (session start), so right after an accepted request it is not in `active`.
- `GET /api/intro-video/active` (customer role) → `{id,title,description,mimeType,fileSize,videoUrl,isViewed,viewedAt,createdAt}`; `POST /api/intro-video/:id/mark-viewed`.

## Socket.IO (session request flow)
Connect to `http://host:4000` (root namespace) with `auth: { token: accessToken }`. Raw engine.io: `ws://host:4000/socket.io/?EIO=4&transport=websocket`, then send `40{"token":"<jwt>"}` after the `0{...}` open packet; events are `42["name",{payload}]`. Bad token → `connect_error`.

Client → server:
- `call-request` `{ request_type: "chat"|"audio"|"video", receiver_id: <expertId> }` (audio_call/video_call also accepted)
- `call-request:cancel` `{ request_id }` (caller, while ringing). **No ack is sent to the caller** — treat it as cancelled locally.

Server → caller:
- `call-request:sent` `{ request_id, receiver_id, status:"sent", totalSeconds:30, delivery:{socket, push} }`
- `call-ringing-tick` `{ request_id, secondsLeft, totalSeconds }` every second (30→…)
- `call-request:accepted` `{ request_id, chatId, senderId, receiverId, conversationId, balanceInfo:{balance,pricePerMinute,freeMinutesRemaining,affordableMinutes,…}, agora:null }` (agora is null here: Agora not configured)
- `call-request:rejected` `{ request_id }`
- `call-timeout` `{ request_id, request_type, reason:"no_answer" }` after 30 s
- `call-ended` `{ request_id, reason }` e.g. `superseded` (a newer request replaced an accepted-but-unstarted one), `join_timeout`, `accept_failed`
- `chat-request:expired` `{ request_id, chatId, reason:"no_first_message" }` — chat accepted but nobody wrote within 60 s
- `call-request:error` `{ message, error_code? }`. Observed messages: `"Receiver is offline"` (expert manual-offline, OR no expert socket connected and push failed — the case when no simulator is running), `"User is currently busy in another session. Please try again later."` (`error_code:"LISTENER_BUSY"`), `"Insufficient…"`-style balance errors, `"Cannot call yourself"`, `"Request type and receiver ID are required"`.

Server → expert: `call-request-response` `{ request_id, request_type, sender_name, senderId, chatId, conversationId, balanceInfo, agora }`; expert replies `call-request:accept {request_id}` / `call-request:reject {request_id}`; accept answers expert with `call-started`.

Chat vs call: same request flow. Calls add Agora tokens + a 30 s join timeout; chat has none and starts billing/`active` only on the first message (messages go via socket `send-message` / REST `POST /api/chats/:chatId/messages`, see API_DOCUMENTATION.md). The caller needs to listen to nothing else for the request phase. While requesting, the caller socket must stay connected (disconnect = request abandoned).
