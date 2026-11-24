const sms = require("../../../src/utils/sms");
const config = require("../../../src/config");

// Backup original fetch
const originalFetch = global.fetch;

describe("SMS Utility", () => {
    beforeEach(() => {
        global.fetch = jest.fn();
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    describe("sendOTP", () => {
        it("should throw error if responseCode is not 200", async () => {
            const mockResponse = {
                responseCode: 400,
                message: "Invalid number"
            };

            global.fetch.mockResolvedValue({
                text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse))
            });

            await expect(sms.sendOTP("1234567890")).rejects.toThrow("Invalid number");
        });

        it("should handle REQUEST_ALREADY_EXISTS as success", async () => {
            const mockResponse = {
                responseCode: 400,
                message: "REQUEST_ALREADY_EXISTS"
            };

            global.fetch.mockResolvedValue({
                text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse))
            });

            const result = await sms.sendOTP("1234567890");
            expect(result).toEqual(mockResponse);
        });

        it("should throw error if JSON is malformed", async () => {
            global.fetch.mockResolvedValue({
                text: jest.fn().mockResolvedValue("invalid json")
            });

            await expect(sms.sendOTP("1234567890")).rejects.toThrow("Invalid response from SMS provider");
        });
    });

    describe("verifyOTP", () => {
        it("should return true if OTP is verified", async () => {
            const mockResponse = {
                responseCode: 200,
                data: { verificationStatus: "VERIFIED" }
            };

            global.fetch.mockResolvedValue({
                text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse))
            });

            const result = await sms.verifyOTP("1234567890", "91", "123456");

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining("https://cpaas.messagecentral.com/verification/v3/validate"),
                expect.objectContaining({
                    method: "GET"
                })
            );
            expect(result).toBe(true);
        });

        it("should return false if OTP verification fails", async () => {
            const mockResponse = {
                responseCode: 200,
                data: { verificationStatus: "EXPIRED" }
            };

            global.fetch.mockResolvedValue({
                text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse))
            });

            const result = await sms.verifyOTP("1234567890", "91", "111111");
            expect(result).toBe(false);
        });

        it("should return false if response is empty", async () => {
            global.fetch.mockResolvedValue({
                text: jest.fn().mockResolvedValue("")
            });

            const result = await sms.verifyOTP("1234567890", "91", "111111");
            expect(result).toBe(false);
        });

        it("should return false if JSON is malformed", async () => {
            global.fetch.mockResolvedValue({
                text: jest.fn().mockResolvedValue("invalid json")
            });

            const result = await sms.verifyOTP("1234567890", "91", "111111");
            expect(result).toBe(false);
        });
    });
});
