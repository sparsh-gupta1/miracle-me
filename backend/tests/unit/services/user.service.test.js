const UserService = require("../../../src/services/user.service");
const { User, UserFavorite, Transaction, Wallet, WalletTransaction } = require("../../../src/models");
const s3Service = require("../../../src/services/s3.service");

jest.mock("../../../src/models", () => ({
    User: {
        findByPk: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        destroy: jest.fn(),
    },
    UserFavorite: {
        findAll: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        destroy: jest.fn(),
    },
    UserBlockList: {
        findOne: jest.fn(),
    },
    Transaction: {
        count: jest.fn(),
    },
    Wallet: {
        destroy: jest.fn(),
    },
    WalletTransaction: {
        count: jest.fn(),
    },
}));

jest.mock("../../../src/services/s3.service", () => ({
    getDownloadUrl: jest.fn((key) => Promise.resolve(`https://s3.url/${key}`)),
    uploadFileToS3: jest.fn(),
}));

jest.mock("../../../src/services/wallet.service", () => ({
    ensureUserWallets: jest.fn().mockResolvedValue(undefined),
}));

describe("UserService", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("deleteAccount", () => {
        it("should soft delete an account by setting isActive to false", async () => {
            const mockUser = { id: "user-1", isActive: true, save: jest.fn(), destroy: jest.fn() };
            User.findByPk.mockResolvedValue(mockUser);

            const result = await UserService.deleteAccount("user-1");

            expect(User.findByPk).toHaveBeenCalledWith("user-1");
            expect(mockUser.isActive).toBe(false);
            expect(mockUser.save).toHaveBeenCalled();
            expect(mockUser.destroy).toHaveBeenCalled();
            expect(result).toEqual(mockUser);
        });

        it("should throw error if user not found", async () => {
            User.findByPk.mockResolvedValue(null);
            await expect(UserService.deleteAccount("user-1")).rejects.toThrow("User not found");
        });
    });

    describe("deleteUser", () => {
        it("permanently deletes a user without transaction history", async () => {
            const mockUser = { id: "user-1", destroy: jest.fn() };
            User.findByPk.mockResolvedValue(mockUser);
            Transaction.count.mockResolvedValue(0);
            WalletTransaction.count.mockResolvedValue(0);

            const result = await UserService.deleteUser("user-1", "permanent");

            expect(Wallet.destroy).toHaveBeenCalledWith({ where: { userId: "user-1" } });
            expect(mockUser.destroy).toHaveBeenCalledWith({ force: true });
            expect(result).toEqual({ deleted: true, softDeleted: false });
        });

        it("rejects permanent deletion when transaction history exists", async () => {
            const mockUser = { id: "user-1", isActive: true, save: jest.fn(), destroy: jest.fn() };
            User.findByPk.mockResolvedValue(mockUser);
            Transaction.count.mockResolvedValue(1);
            WalletTransaction.count.mockResolvedValue(0);

            await expect(UserService.deleteUser("user-1", "permanent")).rejects.toThrow(
                "User has transaction history and cannot be permanently deleted"
            );

            expect(mockUser.save).not.toHaveBeenCalled();
            expect(mockUser.destroy).not.toHaveBeenCalled();
            expect(Wallet.destroy).not.toHaveBeenCalled();
        });

        it("soft deletes when soft deletion is selected", async () => {
            const mockUser = { id: "user-1", isActive: true, save: jest.fn(), destroy: jest.fn() };
            User.findByPk.mockResolvedValue(mockUser);
            Transaction.count.mockResolvedValue(1);
            WalletTransaction.count.mockResolvedValue(0);

            const result = await UserService.deleteUser("user-1", "soft");

            expect(mockUser.isActive).toBe(false);
            expect(mockUser.save).toHaveBeenCalled();
            expect(mockUser.destroy).toHaveBeenCalled();
            expect(result).toEqual({ deleted: false, softDeleted: true });
        });
    });

    describe("toggleFavorite", () => {
        it("should remove favorite if it exists", async () => {
            User.findByPk.mockResolvedValue({ id: "fav-1" });
            const mockFavorite = { destroy: jest.fn() };
            UserFavorite.findOne.mockResolvedValue(mockFavorite);

            const result = await UserService.toggleFavorite("user-1", "fav-1");

            expect(UserFavorite.findOne).toHaveBeenCalled();
            expect(mockFavorite.destroy).toHaveBeenCalled();
            expect(result).toEqual({ isFavorite: false });
        });

        it("should add favorite if it does not exist", async () => {
            User.findByPk.mockResolvedValue({ id: "fav-1" });
            UserFavorite.findOne.mockResolvedValue(null);
            UserFavorite.create.mockResolvedValue({});

            const result = await UserService.toggleFavorite("user-1", "fav-1");

            expect(UserFavorite.create).toHaveBeenCalledWith({ userId: "user-1", favoriteUserId: "fav-1" });
            expect(result).toEqual({ isFavorite: true });
        });

        it("should throw error if favoriting self", async () => {
            await expect(UserService.toggleFavorite("user-1", "user-1")).rejects.toThrow("You cannot favorite yourself");
        });
    });

    describe("updateAvailability", () => {
        it("should update online and video call availability", async () => {
            const mockUser = { id: "user-1", role: "listener", isOnline: false, manualOffline: true, isVideoCallAvailable: false, save: jest.fn() };
            User.findByPk.mockResolvedValue(mockUser);

            const result = await UserService.updateAvailability("user-1", true, true);

            expect(mockUser.isOnline).toBe(true);
            expect(mockUser.manualOffline).toBe(false);
            expect(mockUser.isVideoCallAvailable).toBe(true);
            expect(mockUser.save).toHaveBeenCalled();
        });
    });

    describe("adminCreateUser", () => {
        const fileBuffer = Buffer.from("hello");
        const baseArgs = {
            name: "Jane Listener",
            mobileNumber: "7414852596",
            profileImage: {
                buffer: fileBuffer,
                originalname: "photo.jpeg",
                mimetype: "image/jpeg",
            },
            profile: { bio: "test" },
            roleid: 2, // listener
            age: 30,
            language: ["English", "Hindi"],
        };

        it("should upload the raw bytes of profileImage to S3", async () => {
            User.findOne.mockResolvedValue(null);
            s3Service.uploadFileToS3.mockResolvedValue({ success: true, key: "profile-images/123-photo.jpeg" });
            User.create.mockResolvedValue({ id: "new-user" });

            await UserService.adminCreateUser(baseArgs);

            expect(s3Service.uploadFileToS3).toHaveBeenCalledTimes(1);
            const [passedBuffer, passedFilename, passedFolder, passedContentType] =
                s3Service.uploadFileToS3.mock.calls[0];
            expect(Buffer.isBuffer(passedBuffer)).toBe(true);
            expect(passedBuffer.toString("utf-8")).toBe("hello");
            expect(passedFilename).toBe("photo.jpeg");
            expect(passedFolder).toBe("profile-images");
            expect(passedContentType).toBe("image/jpeg");
        });

        it("should persist age, language and mapped role when creating the user", async () => {
            User.findOne.mockResolvedValue(null);
            s3Service.uploadFileToS3.mockResolvedValue({ success: true, key: "profile-images/123-photo.jpeg" });
            User.create.mockResolvedValue({ id: "new-user" });

            await UserService.adminCreateUser(baseArgs);

            expect(User.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: "Jane Listener",
                    mobileNumber: "7414852596",
                    age: 30,
                    language: ["English", "Hindi"],
                    profileImage: "profile-images/123-photo.jpeg",
                    role: "listener",
                    isVerified: true,
                    isActive: true,
                })
            );
        });

        it("should throw if an active account with the mobile number already exists", async () => {
            User.findOne.mockResolvedValue({ id: "existing", role: "listener" });

            await expect(UserService.adminCreateUser(baseArgs)).rejects.toThrow(
                "This mobile number is already registered as a listener"
            );
            expect(s3Service.uploadFileToS3).not.toHaveBeenCalled();
            expect(User.create).not.toHaveBeenCalled();
        });

        it("should block a listener on a number already active as a user", async () => {
            User.findOne.mockResolvedValue({ id: "existing-user", role: "user" });

            await expect(UserService.adminCreateUser(baseArgs)).rejects.toThrow(
                "This mobile number is already registered as a user"
            );
            expect(User.create).not.toHaveBeenCalled();
        });

        it("should create a new active user when matching users are inactive", async () => {
            User.findOne.mockResolvedValue(null);
            s3Service.uploadFileToS3.mockResolvedValue({ success: true, key: "profile-images/456-photo.jpeg" });
            User.create.mockResolvedValue({ id: "new-user" });

            await UserService.adminCreateUser(baseArgs);

            // Checked across all roles: one active account per mobile number.
            expect(User.findOne).toHaveBeenCalledWith({
                where: { mobileNumber: baseArgs.mobileNumber, isActive: true },
                attributes: ["id", "role"],
            });
            expect(User.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    mobileNumber: baseArgs.mobileNumber,
                    isActive: true,
                })
            );
        });

        it("should throw if the S3 upload fails", async () => {
            User.findOne.mockResolvedValue(null);
            s3Service.uploadFileToS3.mockResolvedValue({ success: false });

            await expect(UserService.adminCreateUser(baseArgs)).rejects.toThrow(
                "Failed to upload profile image"
            );
            expect(User.create).not.toHaveBeenCalled();
        });
    });
});
