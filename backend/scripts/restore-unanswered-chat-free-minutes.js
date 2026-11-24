/**
 * Give back free seconds consumed by chat sessions the listener never answered.
 *
 * Before chats were billed from the listener's first reply, a chat started on the user's first
 * message and was billed from then on, so an unanswered chat could use up the free minutes.
 * This finds those charges (no message from the earner during the billed session) and returns
 * the free seconds to the user's shared free-minutes pool. Paid wallet debits are reported only.
 *
 * Usage:
 *   node scripts/restore-unanswered-chat-free-minutes.js                 # dry run, all users
 *   node scripts/restore-unanswered-chat-free-minutes.js --user <userId> # dry run, one user
 *   node scripts/restore-unanswered-chat-free-minutes.js --apply [--user <userId>]
 */
require("dotenv").config();
const { Op } = require("sequelize");
const {
  Chat,
  Message,
  CommunicationCharge,
  UserFreeMinutesUsage,
  sequelize,
} = require("../src/models");
const freeMinutesService = require("../src/services/freeMinutes.service");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const userIdx = args.indexOf("--user");
const ONLY_USER = userIdx >= 0 ? args[userIdx + 1] : null;

async function findAffectedCharges() {
  const where = { serviceType: "chat" };
  if (ONLY_USER) where.userId = ONLY_USER;
  const charges = await CommunicationCharge.findAll({ where, order: [["chargedAt", "ASC"]] });

  const affected = [];
  for (const charge of charges) {
    const meta = charge.metadata || {};
    const freeSeconds = parseInt(meta.freeSecondsUsed, 10) || 0;
    if (freeSeconds <= 0 || meta.freeSecondsRestored) continue;

    const endedMs = parseInt(String(meta.billingSessionId || "").split(":").pop(), 10);
    const totalSeconds = parseInt(meta.totalDurationSeconds, 10);
    if (!Number.isFinite(endedMs) || !Number.isFinite(totalSeconds)) {
      console.warn(`skip charge ${charge.id}: no session window in metadata`);
      continue;
    }
    const endedAt = new Date(endedMs);
    const startedAt = new Date(endedMs - totalSeconds * 1000);

    const chat = await Chat.findByPk(charge.conversationId, {
      attributes: ["id", "participant1Id", "participant2Id"],
    });
    if (!chat) continue;
    const earnerId = chat.participant1Id === charge.userId ? chat.participant2Id : chat.participant1Id;

    const earnerMessages = await Message.count({
      where: {
        chatId: chat.id,
        senderId: earnerId,
        createdAt: { [Op.between]: [startedAt, endedAt] },
      },
    });
    if (earnerMessages > 0) continue;

    affected.push({
      charge,
      userId: charge.userId,
      chatId: chat.id,
      earnerId,
      startedAt,
      endedAt,
      freeSeconds,
      walletDebited: parseFloat(charge.grossAmount) || 0,
    });
  }
  return affected;
}

async function restore(item) {
  await sequelize.transaction(async (t) => {
    // Re-read under lock so a concurrent run cannot restore the same charge twice.
    const charge = await CommunicationCharge.findByPk(item.charge.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (charge.metadata?.freeSecondsRestored) return;

    const usage = await UserFreeMinutesUsage.findOne({
      where: { user_id: item.userId, service_type: "chat" },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (usage) {
      await usage.update(
        { consumed_seconds: Math.max(0, usage.consumed_seconds - item.freeSeconds) },
        { transaction: t }
      );
    }
    await freeMinutesService.syncUserRemainingSeconds(item.userId, null, t);

    await charge.update(
      {
        metadata: {
          ...charge.metadata,
          freeSecondsRestored: true,
          freeSecondsRestoredAt: new Date().toISOString(),
        },
      },
      { transaction: t }
    );
  });
}

async function main() {
  const affected = await findAffectedCharges();
  console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${affected.length} unanswered chat charge(s) used free minutes`);
  console.table(
    affected.map((a) => ({
      user: a.userId,
      chat: a.chatId,
      charge: a.charge.id,
      startedAt: a.startedAt.toISOString(),
      endedAt: a.endedAt.toISOString(),
      freeSeconds: a.freeSeconds,
      walletDebited: a.walletDebited,
    }))
  );

  const paid = affected.filter((a) => a.walletDebited > 0);
  if (paid.length) {
    console.log(`${paid.length} of these also debited the wallet; that is NOT refunded by this script.`);
  }

  if (!APPLY) {
    console.log("Nothing changed. Re-run with --apply to restore the free seconds.");
    return;
  }
  for (const item of affected) {
    await restore(item);
    console.log(`restored ${item.freeSeconds}s to user ${item.userId} (charge ${item.charge.id})`);
  }
}

main()
  .catch((error) => {
    console.error("Restore failed:", error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
