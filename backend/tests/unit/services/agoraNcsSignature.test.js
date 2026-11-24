const crypto = require("crypto");
const agoraService = require("../../../src/services/agora.service");

describe("AgoraService.verifyNcsSignature", () => {
    const secret = "test-ncs-secret";
    const rawBody = JSON.stringify({ eventType: 103, payload: { channelName: "conv-1", uid: 42 } });

    const sign = (algo, body, key = secret) =>
        crypto.createHmac(algo, key).update(body).digest("hex");

    beforeEach(() => {
        // Singleton: inject the secret directly (constructor reads it from env at load time)
        agoraService.ncsSecret = secret;
    });

    it("accepts a valid Agora-Signature-V2 (HMAC-SHA256)", () => {
        const headers = { "agora-signature-v2": sign("sha256", rawBody) };
        expect(agoraService.verifyNcsSignature(rawBody, headers)).toBe(true);
    });

    it("accepts a valid legacy Agora-Signature (HMAC-SHA1)", () => {
        const headers = { "agora-signature": sign("sha1", rawBody) };
        expect(agoraService.verifyNcsSignature(rawBody, headers)).toBe(true);
    });

    it("rejects a bad signature", () => {
        const headers = { "agora-signature-v2": sign("sha256", rawBody, "wrong-secret") };
        expect(agoraService.verifyNcsSignature(rawBody, headers)).toBe(false);
    });

    it("rejects when no signature header is present", () => {
        expect(agoraService.verifyNcsSignature(rawBody, {})).toBe(false);
    });

    it("rejects when the secret is not configured", () => {
        agoraService.ncsSecret = undefined;
        const headers = { "agora-signature-v2": sign("sha256", rawBody) };
        expect(agoraService.verifyNcsSignature(rawBody, headers)).toBe(false);
    });

    it("rejects when the body was tampered with", () => {
        const headers = { "agora-signature-v2": sign("sha256", rawBody) };
        const tampered = rawBody.replace("103", "104");
        expect(agoraService.verifyNcsSignature(tampered, headers)).toBe(false);
    });
});
