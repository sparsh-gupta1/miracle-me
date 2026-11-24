const fs = require("fs");
const path = require("path");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");
const config = require("../../src/config");
const { sequelize, User } = require("../../src/models");
const { LOG_DIRECTORY } = require("../../src/services/log.service");

const FILE_NAME = `zz-logs-route-test-${process.pid}.log`;
const FILE_PATH = path.join(LOG_DIRECTORY, FILE_NAME);
const CONTENT = "2026-10-09 10:00:00 [INFO]: first\n2026-10-09 10:00:01 [ERROR]: second\n";

describe("Admin Logs API", () => {
    let admin;
    let user;
    let adminToken;
    let userToken;

    beforeAll(async () => {
        fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
        fs.writeFileSync(FILE_PATH, CONTENT);
        await User.destroy({ where: { email: ["logsadmin@logs-test.example.com", "logsuser@logs-test.example.com"] }, force: true });
        admin = await User.create({ name: "Logs Admin", email: "logsadmin@logs-test.example.com", mobileNumber: "9200000001", password: "password123", role: "admin", isVerified: true });
        user = await User.create({ name: "Logs User", email: "logsuser@logs-test.example.com", mobileNumber: "9200000002", password: "password123", role: "user", isVerified: true });
        adminToken = jwt.sign({ id: admin.id, role: "admin" }, config.jwt.secret);
        userToken = jwt.sign({ id: user.id, role: "user" }, config.jwt.secret);
    });

    afterAll(async () => {
        fs.rmSync(FILE_PATH, { force: true });
        await User.destroy({ where: { id: [admin.id, user.id] }, force: true });
        await sequelize.close();
    });

    const get = (url, token = adminToken) => request(app).get(`/api/logs${url}`).set("Authorization", `Bearer ${token}`);

    it("rejects non-admin users", async () => {
        expect((await get("", userToken)).status).toBe(403);
        expect((await get(`/${FILE_NAME}`, userToken)).status).toBe(403);
    });

    it("lists log files", async () => {
        const res = await get("");
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ name: FILE_NAME, size: CONTENT.length })]));
    });

    it("reads entries newest first with filters", async () => {
        const res = await get(`/${FILE_NAME}?limit=10`);
        expect(res.status).toBe(200);
        expect(res.body.data.entries.map((e) => e.message)).toEqual(["second", "first"]);
        expect(res.body.data.nextCursor).toBeNull();

        const errors = await get(`/${FILE_NAME}?level=ERROR`);
        expect(errors.body.data.entries.map((e) => e.message)).toEqual(["second"]);
    });

    it("validates query params", async () => {
        expect((await get(`/${FILE_NAME}?level=nope`)).status).toBe(400);
        expect((await get(`/${FILE_NAME}/follow`)).status).toBe(400);
    });

    it("follows new entries", async () => {
        const res = await get(`/${FILE_NAME}/follow?after=${CONTENT.length}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ entries: [], endCursor: CONTENT.length });
    });

    it("does not serve files outside the log directory", async () => {
        expect((await get("/..%2F.env")).status).toBe(404);
        expect((await get("/..%2Fpackage.json/download")).status).toBe(404);
        expect((await get("/missing.log")).status).toBe(404);
    });

    it("downloads a file", async () => {
        const res = await get(`/${FILE_NAME}/download`);
        expect(res.status).toBe(200);
        expect(res.headers["content-disposition"]).toContain(FILE_NAME);
        expect(res.text).toBe(CONTENT);
    });

    describe("cleanup", () => {
        const ACTIVE = `zzroute${process.pid}-2020-01-02.log`;
        const OLD = `zzroute${process.pid}-2020-01-01.log`;
        const del = (url, token = adminToken) => request(app).delete(`/api/logs${url}`).set("Authorization", `Bearer ${token}`);
        const post = (url, token = adminToken) => request(app).post(`/api/logs${url}`).set("Authorization", `Bearer ${token}`);

        beforeEach(() => {
            [ACTIVE, OLD].forEach((name) => fs.writeFileSync(path.join(LOG_DIRECTORY, name), CONTENT));
        });

        afterAll(() => {
            [ACTIVE, OLD].forEach((name) => fs.rmSync(path.join(LOG_DIRECTORY, name), { force: true }));
        });

        it("rejects non-admin users", async () => {
            expect((await del(`/${OLD}`, userToken)).status).toBe(403);
            expect((await post(`/${OLD}/clear`, userToken)).status).toBe(403);
            expect((await del("?olderThanDays=14", userToken)).status).toBe(403);
        });

        it("does not delete files outside the log directory", async () => {
            expect((await del("/..%2F.env")).status).toBe(404);
            expect((await post("/..%2Fpackage.json/clear")).status).toBe(404);
        });

        it("returns 409 when deleting the active file", async () => {
            const res = await del(`/${ACTIVE}`);
            expect(res.status).toBe(409);
            expect(fs.existsSync(path.join(LOG_DIRECTORY, ACTIVE))).toBe(true);
        });

        it("deletes an old file and clears the active one", async () => {
            const deleted = await del(`/${OLD}`);
            expect(deleted.status).toBe(200);
            expect(fs.existsSync(path.join(LOG_DIRECTORY, OLD))).toBe(false);

            const cleared = await post(`/${ACTIVE}/clear`);
            expect(cleared.status).toBe(200);
            expect(cleared.body.data.freedBytes).toBe(CONTENT.length);
            expect(fs.statSync(path.join(LOG_DIRECTORY, ACTIVE)).size).toBe(0);
        });

        it("validates olderThanDays", async () => {
            expect((await del("")).status).toBe(400);
            expect((await del("?olderThanDays=0")).status).toBe(400);
            expect((await del("?olderThanDays=abc")).status).toBe(400);
        });
    });
});
