const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");
const config = require("../../src/config");
const {
    sequelize,
    User,
    Transaction,
    Chat,
    CommunicationCharge,
    CallRequest,
    DailyEarnings,
} = require("../../src/models");

// Seed into a fixed window far in the past so other test data does not leak into the totals.
const FROM = "2020-03-01T00:00:00+05:30";
const TO = "2020-04-01T00:00:00+05:30";
const IN_RANGE = new Date("2020-03-10T12:00:00+05:30");
const PREVIOUS_RANGE = new Date("2020-02-10T12:00:00+05:30");
const EMAIL_DOMAIN = "@dashboard-test.example.com";

const backdate = (Model, id, date) =>
    sequelize.query(
        `UPDATE "${Model.getTableName()}" SET "${Model.rawAttributes.createdAt.field}" = :date WHERE id = :id`,
        { replacements: { date, id } }
    );

describe("Admin Dashboard API", () => {
    let admin;
    let payer;
    let listener;
    let adminToken;
    let userToken;

    const cleanup = async () => {
        const users = await User.findAll({
            where: { email: { [require("sequelize").Op.like]: `%${EMAIL_DOMAIN}` } },
            paranoid: false,
        });
        const ids = users.map((u) => u.id);
        if (!ids.length) return;
        await CommunicationCharge.destroy({ where: { userId: ids } });
        await DailyEarnings.destroy({ where: { userId: ids } });
        await CallRequest.destroy({ where: { senderId: ids } });
        await Transaction.destroy({ where: { userId: ids } });
        await Chat.destroy({ where: { participant1Id: ids } });
        await Chat.destroy({ where: { participant2Id: ids } });
        await User.destroy({ where: { id: ids }, force: true });
    };

    beforeAll(async () => {
        await cleanup();

        const makeUser = (name, role, mobileNumber) =>
            User.create({
                name, role, mobileNumber,
                email: `${name}${EMAIL_DOMAIN}`,
                password: "password123",
                isVerified: true,
                isActive: true,
            });

        admin = await makeUser("dashadmin", "admin", "9100000001");
        payer = await makeUser("dashpayer", "user", "9100000002");
        listener = await makeUser("dashlistener", "listener", "9100000003");
        const oldUser = await makeUser("dasholduser", "user", "9100000004");

        await backdate(User, payer.id, IN_RANGE);
        await backdate(User, listener.id, IN_RANGE);
        await backdate(User, oldUser.id, PREVIOUS_RANGE);

        const recharges = await Promise.all([
            Transaction.create({ userId: payer.id, amount: 100, status: "completed" }),
            Transaction.create({ userId: payer.id, amount: 50.5, status: "completed" }),
            Transaction.create({ userId: payer.id, amount: 999, status: "failed" }),
        ]);
        await Promise.all(recharges.map((t) => backdate(Transaction, t.id, IN_RANGE)));

        const [p1, p2] = [payer.id, listener.id].sort();
        const chat = await Chat.create({ participant1Id: p1, participant2Id: p2, serviceType: "audio_call", status: "ended" });

        await CommunicationCharge.create({
            conversationId: chat.id,
            userId: payer.id,
            serviceType: "audio_call",
            durationSeconds: 540,
            pricePerMinute: 10,
            ratePerSecond: 10 / 60,
            grossAmount: 90,
            commissionPercentage: 20,
            commissionAmount: 18,
            netEarning: 72,
            pricingSource: "global",
            chargedAt: IN_RANGE,
            metadata: { billingSessionId: `${chat.id}:1`, totalDurationSeconds: 600, freeSecondsUsed: 60, earningNetAmount: 80 },
        });

        const requests = await Promise.all([
            CallRequest.create({ senderId: payer.id, receiverId: listener.id, requestType: "audio", status: "ended", duractionToAccept: 4 }),
            CallRequest.create({ senderId: payer.id, receiverId: listener.id, requestType: "audio", status: "missed" }),
        ]);
        await Promise.all(requests.map((r) => backdate(CallRequest, r.id, IN_RANGE)));

        await DailyEarnings.create({
            userId: listener.id,
            date: "2020-03-10",
            totalGross: 100,
            totalCommission: 20,
            totalNet: 80,
            conversationCount: 1,
            totalDuration: 600,
        });

        adminToken = jwt.sign({ id: admin.id, role: "admin" }, config.jwt.secret);
        userToken = jwt.sign({ id: payer.id, role: "user" }, config.jwt.secret);
    });

    afterAll(async () => {
        await cleanup();
        await sequelize.close();
    });

    const get = (path, token = adminToken) =>
        request(app).get(`/api/dashboard${path}`).set("Authorization", `Bearer ${token}`);
    const range = `from=${encodeURIComponent(FROM)}&to=${encodeURIComponent(TO)}`;

    it("rejects non-admin users", async () => {
        const res = await get(`/overview?${range}`, userToken);
        expect(res.status).toBe(403);
    });

    it("rejects invalid ranges", async () => {
        const res = await get(`/overview?from=${encodeURIComponent(TO)}&to=${encodeURIComponent(FROM)}`);
        expect(res.status).toBe(400);
    });

    it("returns overview KPIs with previous-period comparison", async () => {
        const res = await get(`/overview?${range}`);
        expect(res.status).toBe(200);
        const { users, revenue, activity } = res.body.data;

        expect(users.newUsers).toEqual({ value: 1, previousPeriodValue: 1, changePct: 0 });
        expect(users.newListeners.value).toBe(1);
        expect(revenue.rechargeRevenue.value).toBe(150.5);
        expect(revenue.rechargeCount.value).toBe(2);
        expect(revenue.payingUsers.value).toBe(1);
        expect(revenue.rechargeSuccessRate.value).toBeCloseTo(66.67);
        expect(revenue.grossSpend.value).toBe(90);
        expect(revenue.commission.value).toBe(18);
        expect(revenue.listenerEarnings.value).toBe(80);
        expect(revenue.platformNet.value).toBe(10);
        expect(activity.sessions.value).toBe(1);
        expect(activity.talkMinutes.value).toBe(10);
        expect(activity.freeMinutesUsed.value).toBe(1);
    });

    it("returns a zero-filled trend series", async () => {
        const res = await get(`/trends?metric=recharge_revenue&interval=day&${range}`);
        expect(res.status).toBe(200);
        const { points } = res.body.data;
        expect(points).toHaveLength(31);
        expect(points.find((p) => p.bucket === "2020-03-10").total).toBe(150.5);
        expect(points.find((p) => p.bucket === "2020-03-11").total).toBe(0);
    });

    it("splits new users by role", async () => {
        const res = await get(`/trends?metric=new_users&interval=month&${range}`);
        expect(res.status).toBe(200);
        const [march] = res.body.data.points;
        expect(march.bucket).toBe("2020-03-01");
        expect(march.user).toBe(1);
        expect(march.listener).toBe(1);
        expect(march.total).toBe(2);
    });

    it("rejects unknown trend metrics", async () => {
        const res = await get(`/trends?metric=bogus&${range}`);
        expect(res.status).toBe(400);
    });

    it("returns session breakdown by service type", async () => {
        const res = await get(`/sessions?${range}`);
        expect(res.status).toBe(200);
        expect(res.body.data.byServiceType).toEqual([
            expect.objectContaining({ serviceType: "audio_call", sessions: 1, talkMinutes: 10, freeMinutesUsed: 1, grossSpend: 90 }),
        ]);
    });

    it("returns the request funnel", async () => {
        const res = await get(`/requests?${range}`);
        expect(res.status).toBe(200);
        expect(res.body.data.totals).toEqual(
            expect.objectContaining({ total: 2, accepted: 1, missed: 1, acceptanceRate: 50, missRate: 50, avgTimeToAccept: 4 })
        );
    });

    it("returns the practitioner leaderboard", async () => {
        const res = await get(`/practitioners/top?sortBy=earnings&${range}`);
        expect(res.status).toBe(200);
        const entry = res.body.data.items.find((i) => i.id === listener.id);
        expect(entry).toEqual(
            expect.objectContaining({ earnings: 80, talkMinutes: 10, conversations: 1, requestsReceived: 2, requestsMissed: 1, missRate: 50 })
        );
    });

    it("returns the finance summary", async () => {
        const res = await get(`/finance?${range}`);
        expect(res.status).toBe(200);
        expect(res.body.data.moneyIn.recharges).toBe(150.5);
        expect(res.body.data.consumption.platformNet).toBe(10);
        expect(res.body.data.wallets).toEqual(
            expect.objectContaining({ userBalance: expect.any(Number), earningBalance: expect.any(Number) })
        );
    });
});
