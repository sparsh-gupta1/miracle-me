const { emitStatus, USER_STATUS_AUDIENCE } = require("../../../src/websocket/presence");

const makeIo = () => {
    const roomEmit = jest.fn();
    return { io: { to: jest.fn(() => ({ emit: roomEmit })), emit: jest.fn() }, roomEmit };
};

describe("emitStatus", () => {
    const payload = { userId: "u1", isOnline: true };

    it("sends status about a regular user only to practitioner and admin rooms", () => {
        const { io, roomEmit } = makeIo();
        emitStatus(io, "user-status-changed", payload, "user");
        expect(io.to).toHaveBeenCalledWith(["role:listener", "role:astrologer", "role:admin"]);
        expect(io.to).toHaveBeenCalledWith(USER_STATUS_AUDIENCE);
        expect(roomEmit).toHaveBeenCalledWith("user-status-changed", payload);
        expect(io.emit).not.toHaveBeenCalled();
    });

    it.each(["listener", "astrologer", "admin", undefined, null])(
        "sends status about role %s to everyone",
        (role) => {
            const { io, roomEmit } = makeIo();
            emitStatus(io, "listener:status-changed", payload, role);
            expect(io.emit).toHaveBeenCalledWith("listener:status-changed", payload);
            expect(io.to).not.toHaveBeenCalled();
            expect(roomEmit).not.toHaveBeenCalled();
        },
    );

    it("excludes the sender when given a socket", () => {
        const roomEmit = jest.fn();
        const socket = { to: jest.fn(() => ({ emit: roomEmit })), broadcast: { emit: jest.fn() }, emit: jest.fn() };

        emitStatus(socket, "user-status-changed", payload, "user");
        expect(socket.to).toHaveBeenCalledWith(USER_STATUS_AUDIENCE);
        expect(roomEmit).toHaveBeenCalledWith("user-status-changed", payload);

        emitStatus(socket, "user-status-changed", payload, "listener");
        expect(socket.broadcast.emit).toHaveBeenCalledWith("user-status-changed", payload);
        expect(socket.emit).not.toHaveBeenCalled();
    });
});
