const request = require("supertest");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const app = require("../../src/app");
const config = require("../../src/config");
const { sequelize, User, Transaction } = require("../../src/models");

// Seeded users share an email domain (for cleanup) and a name prefix, so `search` isolates them.
const DOMAIN = "userfilters-test.example.com";
const PREFIX = "Zufx";

describe("Admin user list: sortBy and hasRecharged", () => {
    let admin;
    let adminToken;
    let userToken;
    const users = {};

    const cleanup = async () => {
        const existing = await User.findAll({ where: { email: { [Op.like]: `%@${DOMAIN}` } }, paranoid: false });
        const ids = existing.map((u) => u.id);
        if (!ids.length) return;
        await Transaction.destroy({ where: { userId: ids } });
        await User.destroy({ where: { id: ids }, force: true });
    };

    beforeAll(async () => {
        await cleanup();
        const make = (name, role, mobileNumber, extra = {}) =>
            User.create({ name: `${PREFIX} ${name}`, role, mobileNumber, email: `${name.toLowerCase()}@${DOMAIN}`, password: "password123", isVerified: true, isActive: true, ...extra });

        admin = await make("FilterAdmin", "admin", "9300000001");
        users.charlie = await make("Charlie", "user", "9300000002", { age: 30 });
        users.alice = await make("Alice", "user", "9300000003", { age: 25 });
        users.bob = await make("Bob", "user", "9300000004");          // no age: sorted last
        users.dave = await make("Dave", "user", "9300000005", { age: 40 });

        await Transaction.create({ userId: users.alice.id, amount: 100, status: "completed" });
        await Transaction.create({ userId: users.charlie.id, amount: 50, status: "completed" });
        await Transaction.create({ userId: users.charlie.id, amount: 20, status: "failed" });
        // Dave only has a failed recharge, so he has never actually recharged.
        await Transaction.create({ userId: users.dave.id, amount: 70, status: "failed" });

        adminToken = jwt.sign({ id: admin.id, role: "admin" }, config.jwt.secret);
        userToken = jwt.sign({ id: users.alice.id, role: "user" }, config.jwt.secret);
    });

    afterAll(async () => {
        await cleanup();
        await sequelize.close();
    });

    // Role id 3 = user (src/utils/CONSTANT.js)
    const list = (query, token = adminToken) =>
        request(app)
            .get(`/api/user/3/admin-panel?search=${PREFIX}&limit=100&${query}`)
            .set("Authorization", `Bearer ${token}`);
    const names = (res) => res.body.data.users.map((u) => u.name.replace(`${PREFIX} `, ""));

    it("rejects non-admin users", async () => {
        expect((await list("", userToken)).status).toBe(403);
    });

    it("filters users who have recharged", async () => {
        const res = await list("hasRecharged=true&sortBy=name&order=asc");
        expect(res.status).toBe(200);
        expect(names(res)).toEqual(["Alice", "Charlie"]);
        expect(res.body.data.total).toBe(2);
    });

    it("filters users who have never recharged, ignoring failed attempts", async () => {
        const res = await list("hasRecharged=false&sortBy=name&order=asc");
        expect(res.status).toBe(200);
        expect(names(res)).toEqual(["Bob", "Dave"]);
    });

    it("returns everyone when hasRecharged is not set", async () => {
        const res = await list("sortBy=name&order=desc");
        expect(names(res)).toEqual(["Dave", "Charlie", "Bob", "Alice"]);
    });

    it("sorts with empty values last in both directions", async () => {
        expect(names(await list("sortBy=age&order=asc"))).toEqual(["Alice", "Charlie", "Dave", "Bob"]);
        expect(names(await list("sortBy=age&order=desc"))).toEqual(["Dave", "Charlie", "Alice", "Bob"]);
    });

    it("rejects invalid sort and filter values", async () => {
        expect((await list("sortBy=password")).status).toBe(400);
        expect((await list("order=sideways")).status).toBe(400);
        expect((await list("hasRecharged=maybe")).status).toBe(400);
    });
});
