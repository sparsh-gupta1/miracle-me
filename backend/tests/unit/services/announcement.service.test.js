const announcementService = require("../../../src/services/announcement.service");
const { Announcement, User, sequelize } = require("../../../src/models");

describe("Announcement Service", () => {
    let admin;

    beforeAll(async () => {
        admin = await User.create({
            name: "Announcement Admin",
            email: "announcementadmin@example.com",
            mobileNumber: "7777777001",
            password: "password123",
            role: "admin",
            isVerified: true,
        });
    });

    afterEach(async () => {
        await Announcement.destroy({ where: {}, force: true });
    });

    afterAll(async () => {
        await User.destroy({ where: { id: admin.id }, force: true });
        await sequelize.close();
    });

    describe("createAnnouncement", () => {
        it("should create an announcement with explicit target roles", async () => {
            const announcement = await announcementService.createAnnouncement(
                { message: "Listeners only", targetRoles: ["listener"] },
                admin.id
            );

            expect(announcement).toBeDefined();
            expect(announcement.message).toBe("Listeners only");
            expect(announcement.targetRoles).toEqual(["listener"]);
            expect(announcement.isActive).toBe(true);
            expect(announcement.createdBy).toBe(admin.id);
        });

        it("should default target roles to all three roles when omitted", async () => {
            const announcement = await announcementService.createAnnouncement(
                { message: "For everyone" },
                admin.id
            );

            expect(announcement.targetRoles).toEqual([
                "user",
                "listener",
                "astrologer",
            ]);
        });
    });

    describe("getAnnouncements", () => {
        beforeEach(async () => {
            await announcementService.createAnnouncement(
                { message: "For listeners", targetRoles: ["listener"] },
                admin.id
            );
            await announcementService.createAnnouncement(
                { message: "For users", targetRoles: ["user"] },
                admin.id
            );
            await announcementService.createAnnouncement(
                {
                    message: "For users and astrologers",
                    targetRoles: ["user", "astrologer"],
                },
                admin.id
            );
        });

        it("should return only announcements targeted at the caller's role", async () => {
            const result = await announcementService.getAnnouncements({
                role: "listener",
            });

            expect(result.totalCount).toBe(1);
            expect(result.announcements[0].message).toBe("For listeners");
        });

        it("should include multi-role announcements for each targeted role", async () => {
            const result = await announcementService.getAnnouncements({
                role: "user",
            });

            const messages = result.announcements.map((a) => a.message);
            expect(result.totalCount).toBe(2);
            expect(messages).toContain("For users");
            expect(messages).toContain("For users and astrologers");
        });

        it("should return all active announcements for admin callers", async () => {
            const result = await announcementService.getAnnouncements({
                role: "admin",
            });

            expect(result.totalCount).toBe(3);
        });

        it("should exclude inactive announcements", async () => {
            const inactive = await announcementService.createAnnouncement(
                { message: "Hidden", targetRoles: ["listener"] },
                admin.id
            );
            await announcementService.updateAnnouncement(inactive.id, {
                isActive: false,
            });

            const result = await announcementService.getAnnouncements({
                role: "listener",
            });

            expect(result.totalCount).toBe(1);
            expect(result.announcements[0].message).toBe("For listeners");
        });
    });

    describe("updateAnnouncement", () => {
        it("should update target roles", async () => {
            const announcement = await announcementService.createAnnouncement(
                { message: "Retarget me", targetRoles: ["user"] },
                admin.id
            );

            const updated = await announcementService.updateAnnouncement(
                announcement.id,
                { targetRoles: ["listener", "astrologer"] }
            );

            expect(updated.targetRoles).toEqual(["listener", "astrologer"]);
            expect(updated.message).toBe("Retarget me");
        });

        it("should keep target roles unchanged when not provided", async () => {
            const announcement = await announcementService.createAnnouncement(
                { message: "Keep my roles", targetRoles: ["astrologer"] },
                admin.id
            );

            const updated = await announcementService.updateAnnouncement(
                announcement.id,
                { message: "Updated text" }
            );

            expect(updated.targetRoles).toEqual(["astrologer"]);
            expect(updated.message).toBe("Updated text");
        });
    });
});
