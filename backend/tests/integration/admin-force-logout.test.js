const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");
const config = require("../../src/config");
const authService = require("../../src/services/auth.service");
const { sequelize, User } = require("../../src/models");

const EMAILS = ["fl_admin@forcelogout-test.example.com", "fl_user@forcelogout-test.example.com", "fl_other@forcelogout-test.example.com"];

describe("Admin force logout", () => {
    let admin;
    let target;
    let other;
    let adminToken;

    const asUser = (token) => request(app).get("/api/user").set("Authorization", `Bearer ${token}`);
    const forceLogout = (userId, token = adminToken) =>
        request(app).post(`/api/user/${userId}/force-logout`).set("Authorization", `Bearer ${token}`);

    beforeAll(async () => {
        await User.destroy({ where: { email: EMAILS }, force: true });
        const make = (email, role, mobileNumber) =>
            User.create({ name: email.split("@")[0], email, role, mobileNumber, password: "password123", isVerified: true, isActive: true });
        admin = await make(EMAILS[0], "admin", "9400000001");
        target = await make(EMAILS[1], "user", "9400000002");
        other = await make(EMAILS[2], "user", "9400000003");
        adminToken = authService.generateTokens(admin).accessToken;
    });

    afterAll(async () => {
        await User.destroy({ where: { email: EMAILS }, force: true });
        await sequelize.close();
    });

    it("only admins can force logout", async () => {
        const userToken = authService.generateTokens(other).accessToken;
        expect((await forceLogout(target.id, userToken)).status).toBe(403);
    });

    it("returns 404 for unknown or malformed user ids", async () => {
        expect((await forceLogout("00000000-0000-0000-0000-000000000000")).status).toBe(404);
        expect((await forceLogout("not-a-uuid")).status).toBe(404);
    });

    it("revokes the user's existing tokens but not new logins or other users", async () => {
        const before = authService.generateTokens(await User.findByPk(target.id));
        // Tokens from before token versions existed have no "tv" claim.
        const legacyToken = jwt.sign({ id: target.id, role: "user" }, config.jwt.secret);
        const otherToken = authService.generateTokens(other).accessToken;
        expect((await asUser(before.accessToken)).status).toBe(200);
        expect((await asUser(legacyToken)).status).toBe(200);

        const res = await forceLogout(target.id);
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ userId: target.id, role: "user" });

        const revoked = await asUser(before.accessToken);
        expect(revoked.status).toBe(401);
        expect(revoked.body.code).toBe("SESSION_REVOKED");
        expect((await asUser(legacyToken)).status).toBe(401);
        await expect(authService.refreshAccessToken(before.refreshToken)).rejects.toMatchObject({ name: "UnauthorizedError" });

        // Logging in again issues tokens with the new version.
        const after = authService.generateTokens(await User.findByPk(target.id));
        expect((await asUser(after.accessToken)).status).toBe(200);
        await expect(authService.refreshAccessToken(after.refreshToken)).resolves.toHaveProperty("tokens.accessToken");

        expect((await asUser(otherToken)).status).toBe(200);
    });

    it("clears the push token", async () => {
        await User.update({ fcmToken: "device-token" }, { where: { id: target.id } });
        await forceLogout(target.id);
        expect((await User.findByPk(target.id)).fcmToken).toBeNull();
    });

    it("deactivating a user also logs them out", async () => {
        const token = authService.generateTokens(await User.findByPk(other.id)).accessToken;
        const res = await request(app)
            .patch(`/api/user/${other.id}/active-status`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ isActive: false });
        expect(res.status).toBe(200);
        expect((await asUser(token)).status).toBe(401);
    });

    it("does not expose tokenVersion in user JSON", async () => {
        expect((await User.findByPk(target.id)).toJSON()).not.toHaveProperty("tokenVersion");
    });
});
