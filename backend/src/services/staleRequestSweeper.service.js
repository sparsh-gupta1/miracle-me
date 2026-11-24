const { Op } = require("sequelize");
const { CallRequest, Chat, User } = require("../models");
const redisService = require("./redis.service");
const conversationService = require("./conversation.service");
const logger = require("../utils/logger");

// Ring window is 30s; anything still pending after this lost its in-process timer (restart, crash).
const PENDING_MAX_AGE_MS = 2 * 60 * 1000;
// An accepted request whose session never started (chat accepted but no first message, call that
// nobody joined) and whose 60s/30s timer was lost. Matches the age limit in isUserTrulyBusy.
const ACCEPTED_MAX_AGE_MS = 2 * 60 * 1000;
const BUSY_KEY_PATTERN = "user:*:busy";
const SWEEP_INTERVAL_MS = 60 * 1000;
const LOCK_KEY = "busy-sweeper-lock";
const LOCK_TTL_SECONDS = 55;
const BATCH_LIMIT = 200;

/**
 * Safety net for busy state.
 *
 * The normal paths release busy flags when a request is rejected, cancelled, times out or a
 * session ends. All of those depend on in-process timers and socket events, which are lost on a
 * restart and never exist for an accepted chat request that nobody writes to. This sweeper closes
 * such requests and frees the users, so a listener cannot stay "busy" because nobody happened to
 * try to contact them.
 */
class StaleRequestSweeperService {
    constructor() {
        this.timer = null;
    }

    /**
     * Run once now and then on an interval. Safe to call once at boot.
     * @param {object} io - Socket.IO server (used to broadcast freed users)
     */
    start(io, intervalMs = SWEEP_INTERVAL_MS) {
        if (this.timer) return;
        const run = () =>
            this.sweep(io).catch((err) => logger.error("[BusySweeper] sweep failed:", err));
        run();
        this.timer = setInterval(run, intervalMs);
        if (this.timer.unref) this.timer.unref();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /**
     * One pass. A short Redis lock keeps multiple instances from sweeping simultaneously.
     * @returns {Promise<{missed: number, ended: number, healed: number}|null>} null when another instance holds the lock
     */
    async sweep(io = null) {
        const acquired = await redisService.client.set(LOCK_KEY, String(process.pid), {
            NX: true,
            EX: LOCK_TTL_SECONDS,
        });
        if (!acquired) return null;

        const counts = { missed: 0, ended: 0, healed: 0 };
        try {
            counts.missed = await this._closeStalePending(io);
            counts.ended = await this._closeStaleAccepted(io);
            counts.healed = await this._healOrphanedFlags(io);
            counts.healed += await this._healOrphanedRedisBusy(io);
            if (counts.missed || counts.ended || counts.healed) {
                logger.info(`[BusySweeper] missed=${counts.missed} ended=${counts.ended} healed=${counts.healed}`);
            }
        } finally {
            try {
                await redisService.client.del(LOCK_KEY);
            } catch (err) {
                logger.warn(`[BusySweeper] could not release lock: ${err.message}`);
            }
        }
        return counts;
    }

    async _closeStalePending(io) {
        const stale = await CallRequest.findAll({
            where: {
                status: "pending",
                requestTimestamp: { [Op.lt]: new Date(Date.now() - PENDING_MAX_AGE_MS) },
            },
            limit: BATCH_LIMIT,
        });

        let closed = 0;
        for (const request of stale) {
            // Conditional claim: leave it alone if it was accepted/cancelled while we were looking.
            const [claimed] = await CallRequest.update(
                { status: "missed", missedTimestamp: new Date() },
                { where: { id: request.id, status: "pending" } }
            );
            if (!claimed) continue;
            await this._releasePair(request, io);
            closed += 1;
        }
        return closed;
    }

    async _closeStaleAccepted(io) {
        const cutoff = new Date(Date.now() - ACCEPTED_MAX_AGE_MS);
        const stale = await CallRequest.findAll({
            where: {
                status: "accepted",
                // Rows without an acceptance timestamp (legacy) fall back to when they were made.
                [Op.or]: [
                    { acceptanceTimestamp: { [Op.lt]: cutoff } },
                    { acceptanceTimestamp: null, requestTimestamp: { [Op.lt]: cutoff } },
                ],
            },
            limit: BATCH_LIMIT,
        });

        let closed = 0;
        for (const request of stale) {
            const chat = await this._findPairChat(request);
            // A started chat means the session is live; the request row is just not closed yet.
            if (chat?.status === "started") continue;

            const [claimed] = await CallRequest.update(
                { status: "ended" },
                { where: { id: request.id, status: "accepted" } }
            );
            if (!claimed) continue;
            await this._releasePair(request, io, chat);
            closed += 1;
        }
        return closed;
    }

    /**
     * A DB busy flag that nothing backs: no Redis session hash, no started chat, no live request,
     * and not a manual do-not-disturb. Covers a release that failed after its commit.
     */
    async _healOrphanedFlags(io) {
        const flagged = await User.findAll({
            where: { isBusy: true, isManualBusy: false },
            attributes: ["id"],
            limit: BATCH_LIMIT,
        });

        let healed = 0;
        for (const user of flagged) {
            const session = await redisService.getUserBusyStatus(user.id);
            if (session) continue;
            const verified = await conversationService.isUserTrulyBusy(user.id);
            if (verified.status !== "NOT_BUSY") continue;
            const { freed } = await conversationService.releaseBusyForSession({
                userIds: [user.id],
                io,
                force: true,
            });
            healed += freed.length;
        }
        return healed;
    }

    /**
     * A Redis busy hash that nothing backs any more (its conversation is not started and the user
     * has no live request). The DB pass above only sees users whose is_busy is still true, so a
     * hash left behind after the DB flag was cleared would otherwise show the user busy for its
     * whole 2h TTL.
     */
    async _healOrphanedRedisBusy(io) {
        const userIds = [];
        for await (const entry of redisService.client.scanIterator({ MATCH: BUSY_KEY_PATTERN, COUNT: 100 })) {
            // node-redis v4 yields a key per step; v5 yields a batch (array) of keys.
            for (const key of [].concat(entry)) {
                const userId = key.split(":")[1];
                if (userId) userIds.push(userId);
            }
            if (userIds.length >= BATCH_LIMIT) break;
        }

        let healed = 0;
        for (const userId of userIds) {
            const busy = await redisService.getUserBusyStatus(userId);
            if (!busy) continue;
            const user = await User.findByPk(userId, { attributes: ["id"] });
            if (!user) {
                await redisService.clearUserBusyStatus(userId);
                continue;
            }
            if (await conversationService.isBusyHashLive(userId, busy)) continue;
            const { freed } = await conversationService.releaseBusyForSession({
                userIds: [userId],
                io,
                force: true,
            });
            healed += freed.length;
        }
        return healed;
    }

    _findPairChat(request) {
        return Chat.findOne({
            where: {
                [Op.or]: [
                    { participant1Id: request.senderId, participant2Id: request.receiverId },
                    { participant1Id: request.receiverId, participant2Id: request.senderId },
                ],
            },
            attributes: ["id", "status"],
        });
    }

    async _releasePair(request, io, knownChat = undefined) {
        const chat = knownChat === undefined ? await this._findPairChat(request) : knownChat;
        try {
            await redisService.client.del(`call:${request.id}`);
            if (chat?.id) await redisService.client.del(`call:${chat.id}`);
        } catch (err) {
            logger.warn(`[BusySweeper] could not clear call state for request ${request.id}: ${err.message}`);
        }
        await conversationService.releaseBusyForSession({
            conversationId: chat?.id || null,
            userIds: [request.senderId, request.receiverId],
            io,
        });
    }
}

module.exports = new StaleRequestSweeperService();
module.exports.PENDING_MAX_AGE_MS = PENDING_MAX_AGE_MS;
module.exports.ACCEPTED_MAX_AGE_MS = ACCEPTED_MAX_AGE_MS;
