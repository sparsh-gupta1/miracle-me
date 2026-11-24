# Demo deploy (one server, Docker)

Needs: a Linux server with Docker + Docker Compose, and TCP port 4000 open (cloud firewall / security group / `ufw allow 4000`).
No Firebase, SMS provider, Agora, Razorpay/Cashfree or AWS account is needed for the demo.

```bash
# on the server, inside this folder
cp .env.demo.example .env.demo
# fill the secrets:
sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$(openssl rand -hex 12)/; s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 24)/; s/^JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$(openssl rand -hex 24)/; s/^BANK_ENCRYPTION_KEY=.*/BANK_ENCRYPTION_KEY=$(openssl rand -hex 32)/" .env.demo
docker compose --env-file .env.demo -f docker-compose.demo.yml up -d --build
curl http://localhost:4000/health        # {"status":"ok", ... database + redis connected}
```

Then in the iOS project set `APIBaseURL` in `Config/Info-Additions.plist` to `http://<server-public-ip>:4000` and rebuild.

## Demo logins
- Customer: `9999999999` (₹150, with history). Any other number also works and creates a new customer.
- OTP: the `DEMO_OTP` value (default `1234`) for every number. Change it if the IP is public.
- Experts 9000000001, 9000000002, 9000000003, 9000000006 are kept connected by the `experts` container and auto-accept a request after 4 s.
  Others (Sunita = busy, Dr. Lakshmi = offline, Meera, Devendra) show their status but a request to Meera/Devendra answers "Receiver is offline".
- "Recharge" in the app uses the demo top-up (works only because `DEMO_MODE=true`).

## Operations
- Logs: `docker compose -f docker-compose.demo.yml logs -f api experts`
- Restart: `docker compose --env-file .env.demo -f docker-compose.demo.yml restart api`
- Reset all data: `docker compose --env-file .env.demo -f docker-compose.demo.yml down -v` then `up -d` again.
- Only the API port is published; Postgres and Redis are reachable only inside the compose network.
