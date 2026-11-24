const { assertCanCommunicate } = require("../../../src/utils/communicationRules");

describe("assertCanCommunicate", () => {
    it.each([
        ["user", "listener"],
        ["listener", "user"],
        ["user", "astrologer"],
        ["listener", "listener"],
        ["astrologer", "astrologer"],
    ])("allows %s ↔ %s", (a, b) => {
        expect(() => assertCanCommunicate(a, b)).not.toThrow();
    });

    it("rejects user ↔ user", () => {
        expect(() => assertCanCommunicate("user", "user")).toThrow(
            "Users cannot communicate with each other"
        );
    });

    it.each([
        ["listener", "astrologer"],
        ["astrologer", "listener"],
    ])("rejects %s ↔ %s", (a, b) => {
        expect(() => assertCanCommunicate(a, b)).toThrow(
            "Listeners and Astrologers cannot communicate with each other"
        );
    });
});
