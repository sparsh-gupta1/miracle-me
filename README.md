# Miracle Me – demo bundle for dev testing

- `backend/` Node API + Docker demo stack (Postgres, Redis, simulated experts). Details: `backend/DEMO_DEPLOY.md`
- `app/` iOS app (open `app/miracle-me.xcodeproj` in Xcode). Review notes: `app/CODE_REVIEW.md`

## 1. Run the backend (needs Docker)
```bash
cd backend
cp .env.demo.example .env.demo
sed -i.bak "s/^DB_PASSWORD=.*/DB_PASSWORD=$(openssl rand -hex 12)/; s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 24)/; s/^JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$(openssl rand -hex 24)/; s/^BANK_ENCRYPTION_KEY=.*/BANK_ENCRYPTION_KEY=$(openssl rand -hex 32)/" .env.demo
docker compose --env-file .env.demo -f docker-compose.demo.yml up -d --build
curl http://localhost:4000/health
```
On a remote server, open TCP 4000 in the firewall. Change `DEMO_OTP` in `.env.demo` if the IP is public.

## 2. Run the app
1. Set `APIBaseURL` in `app/Config/Info-Additions.plist` (default `http://localhost:4000` works for the simulator on the same Mac; use `http://<server-ip>:4000` otherwise).
2. Build and run in Xcode (simulator).

## 3. Demo login
Customer `9999999999`, OTP `1234` (any number works; OTP is `DEMO_OTP`).
Experts 9000000001/2/3/6 are kept online by the `experts` container and accept requests after ~4 s.

## Known limits
- After a request is accepted the app lands on the Chats tab; there is no chat/call screen yet.
- "Share birth details" toggles do nothing (no backend field). Expert mode shows fixed sample data.
- Plain-HTTP exception in the plist and demo OTP/top-up are demo-only; remove before TestFlight/App Store.
- Firebase/SMS/Agora/payment/S3 are not configured (not needed for the demo). The Firebase key was deliberately left out of this zip.
