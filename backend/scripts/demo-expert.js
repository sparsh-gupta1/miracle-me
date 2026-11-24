/**
 * Demo expert simulator.
 *   node scripts/demo-expert.js <mobile> [--reject] [--delay=4] [--url=http://localhost:4000]
 * Logs in as a seeded expert (DEMO_OTP flow), listens for incoming requests and
 * auto-accepts (or rejects) after --delay seconds.
 */
const { io } = require("socket.io-client");

const args = process.argv.slice(2);
const mobile = args.find((a) => /^\d{10}$/.test(a));
const reject = args.includes("--reject");
const delay = Number((args.find((a) => a.startsWith("--delay=")) || "--delay=4").split("=")[1]);
const base = (args.find((a) => a.startsWith("--url=")) || "--url=http://localhost:4000").split("=")[1];
const otp = process.env.DEMO_OTP || "1234";
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

if (!mobile) {
  console.error("usage: node scripts/demo-expert.js <10-digit mobile> [--reject] [--delay=4]");
  process.exit(1);
}

const post = async (path, body) => {
  const res = await fetch(`${base}/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(json)}`);
  return json;
};

(async () => {
  const { userId } = await post("/auth/request-otp", { mobileNumber: mobile });
  const { tokens, user } = await post("/auth/verify-otp", { uuid: userId, otp });
  log(`logged in as ${user.name} (${user.role})`);

  const socket = io(base, { auth: { token: tokens.accessToken }, transports: ["websocket"] });
  socket.on("connect", () => log("socket connected", socket.id));
  socket.on("connect_error", (e) => log("connect_error", e.message));
  socket.on("call-request-response", (req) => {
    log(`incoming ${req.request_type} request ${req.request_id} from ${req.sender_name}`);
    setTimeout(() => {
      const event = reject ? "call-request:reject" : "call-request:accept";
      log(`-> ${event}`);
      socket.emit(event, { request_id: req.request_id });
    }, delay * 1000);
  });
  for (const ev of ["call-started", "call-timeout", "call-ended", "call-request:error", "chat-request:expired"]) {
    socket.on(ev, (p) => log(`<- ${ev}`, JSON.stringify(p)));
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
