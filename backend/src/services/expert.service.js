const { Op } = require("sequelize");
const { User, UserFavorite, UserBlockList, Chat, Message } = require("../models");
const pricingService = require("./pricing.service");
const conversationService = require("./conversation.service");
const freeMinutesService = require("./freeMinutes.service");
const walletService = require("./wallet.service");
const redisService = require("./redis.service");

const EXPERT_ROLES = ["astrologer", "listener"];
const SERVICE_TYPES = { chat: "chat", audio: "audio_call", video: "video_call" };
const SERVICE_NAMES = { chat: "chat", audio_call: "audio", video_call: "video" };

function badRequest(message) {
  const error = new Error(message);
  error.name = "ValidationError";
  error.errors = [{ message, path: [], type: "custom" }];
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.name = "NotFoundError";
  return error;
}

function safeIO() {
  try {
    return require("../config/websocket").getIO();
  } catch (err) {
    return null;
  }
}

const toNumber = (value) => (value === null || value === undefined ? null : parseFloat(value));

/** Builds the app-facing expert shape. `ctx` carries pre-fetched per-request lookups. */
async function buildDto(user, ctx, { detail = false } = {}) {
  const profile = user.profile || {};
  const current = await pricingService.getMyCurrentPricing(user.id, user.role);
  const videoOk = user.isVideoCallAvailable !== false;

  const busy = ctx.busyById.get(user.id);
  let status = "online";
  if (user.manualOffline) status = "offline";
  else if (user.isManualBusy || user.isBusy || busy?.isBusy) status = "busy";

  const dto = {
    id: user.id,
    name: user.name || "Expert",
    role: user.role,
    headline: profile.headline || "",
    specialty: profile.specialty || (user.role === "listener" ? "Listener" : "Astrologer"),
    rating: user.rating || 0,
    reviewCount: profile.reviewCount || 0,
    languages: user.language || [],
    gender: profile.gender || null,
    experienceYears: profile.experienceYears ?? null,
    status,
    isFavorite: ctx.favouriteIds.has(user.id),
    profileImage: user.profileImage && /^https?:/.test(user.profileImage) ? user.profileImage : null,
    pricing: {
      chat: toNumber(current.chat?.pricePerMinute),
      audio: toNumber(current.audio_call?.pricePerMinute),
      video: videoOk ? toNumber(current.video_call?.pricePerMinute) : null,
    },
  };

  if (detail) {
    dto.about = profile.about || "";
    dto.specialities = profile.specialities || [];
    dto.featuredReview = profile.featuredReview || null;
    const remaining = {};
    for (const [name, type] of Object.entries(SERVICE_TYPES)) {
      const seconds = await freeMinutesService.getUserFreeSecondsRemaining(ctx.userId, type);
      remaining[name] = Math.floor(seconds / 60);
    }
    dto.freeMinutes = remaining;
  }
  return dto;
}

async function buildContext(userId, expertIds) {
  const [favourites, busyById] = await Promise.all([
    UserFavorite.findAll({ where: { userId }, attributes: ["favoriteUserId"] }),
    conversationService.getBusyInfo(expertIds, safeIO()),
  ]);
  return { userId, favouriteIds: new Set(favourites.map((f) => f.favoriteUserId)), busyById };
}

async function blockedIds(userId) {
  const rows = await UserBlockList.findAll({
    where: { [Op.or]: [{ userId }, { blockedUserId: userId }] },
    attributes: ["userId", "blockedUserId"],
  });
  return rows.map((r) => (r.userId === userId ? r.blockedUserId : r.userId));
}

const EXPERT_ATTRIBUTES = [
  "id", "name", "role", "rating", "language", "profile", "profileImage",
  "isVideoCallAvailable", "manualOffline", "isBusy", "isManualBusy",
];

async function listExperts(userId, q = {}) {
  if (q.kind && !EXPERT_ROLES.includes(q.kind)) throw badRequest("kind must be astrologer or listener");
  if (q.gender && !["female", "male"].includes(q.gender)) throw badRequest("gender must be female or male");

  const excluded = await blockedIds(userId);
  const users = await User.findAll({
    where: {
      role: q.kind ? q.kind : { [Op.in]: EXPERT_ROLES },
      isActive: true,
      id: excluded.length ? { [Op.notIn]: excluded } : { [Op.ne]: userId },
    },
    attributes: EXPERT_ATTRIBUTES,
  });

  const ctx = await buildContext(userId, users.map((u) => u.id));
  let experts = await Promise.all(users.map((u) => buildDto(u, ctx)));

  const num = (v) => (v === undefined || v === "" ? null : Number(v));
  const term = q.q ? String(q.q).trim().toLowerCase() : "";
  const minRating = num(q.minRating), minPrice = num(q.minPrice), maxPrice = num(q.maxPrice);
  const minExp = num(q.minExperience), maxExp = num(q.maxExperience);
  const language = q.language ? String(q.language).toLowerCase() : "";

  experts = experts.filter((e) => {
    if (term && ![e.name, e.specialty, e.headline].some((s) => (s || "").toLowerCase().includes(term))) return false;
    if (q.onlineOnly === "true" && e.status !== "online") return false;
    if (q.favouritesOnly === "true" && !e.isFavorite) return false;
    if (minRating !== null && e.rating < minRating) return false;
    if (minPrice !== null && (e.pricing.chat ?? 0) < minPrice) return false;
    if (maxPrice !== null && (e.pricing.chat ?? 0) > maxPrice) return false;
    if (language && !e.languages.some((l) => l.toLowerCase() === language)) return false;
    if (q.gender && e.gender !== q.gender) return false;
    if (minExp !== null && (e.experienceYears ?? 0) < minExp) return false;
    if (maxExp !== null && (e.experienceYears ?? 0) > maxExp) return false;
    return true;
  });

  experts.sort((a, b) => (b.status === "online") - (a.status === "online") || b.rating - a.rating);

  const page = Math.max(parseInt(q.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(q.limit) || 50, 1), 100);
  const offset = (page - 1) * limit;
  return {
    experts: experts.slice(offset, offset + limit),
    totalCount: experts.length,
    hasMore: offset + limit < experts.length,
  };
}

async function findExpert(userId, expertId) {
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(expertId)) throw notFound("Expert not found");
  const user = await User.findOne({
    where: { id: expertId, role: { [Op.in]: EXPERT_ROLES }, isActive: true },
    attributes: EXPERT_ATTRIBUTES,
  });
  if (!user || (await blockedIds(userId)).includes(user.id)) throw notFound("Expert not found");
  return user;
}

async function getExpert(userId, expertId) {
  const user = await findExpert(userId, expertId);
  const ctx = await buildContext(userId, [user.id]);
  return buildDto(user, ctx, { detail: true });
}

async function getQuote(userId, expertId, service) {
  const serviceType = SERVICE_TYPES[service];
  if (!serviceType) throw badRequest("service must be chat, audio or video");
  const user = await findExpert(userId, expertId);
  if (serviceType === "video_call" && user.isVideoCallAvailable === false) {
    throw badRequest("Video calls are not available for this expert");
  }

  const v = await conversationService.validateBalanceAndCalculateDuration(userId, user.id, serviceType, { readOnly: true });
  let rechargeAmount = 0;
  if (!v.hasSufficientBalance) {
    const shortfall = v.pricePerMinute * 5 - v.balance;
    rechargeAmount = Math.max(10, Math.ceil(shortfall / 10) * 10);
  }
  return {
    service,
    pricePerMinute: v.pricePerMinute,
    balance: v.balance,
    freeMinutes: v.freeMinutesRemaining,
    talkMinutes: v.affordableMinutes,
    hasSufficientBalance: v.hasSufficientBalance,
    rechargeAmount,
  };
}

async function getSessions(userId) {
  const chats = await Chat.findAll({
    where: { [Op.or]: [{ participant1Id: userId }, { participant2Id: userId }] },
    attributes: ["id", "participant1Id", "participant2Id", "serviceType", "status", "startedAt", "endedAt", "durationSeconds", "lastMessageAt", "createdAt"],
    order: [["createdAt", "DESC"]],
    limit: 200,
  });

  const otherId = (c) => (c.participant1Id === userId ? c.participant2Id : c.participant1Id);
  const ids = [...new Set(chats.map(otherId))];
  const users = await User.findAll({ where: { id: { [Op.in]: ids }, role: { [Op.in]: EXPERT_ROLES } }, attributes: EXPERT_ATTRIBUTES });
  const ctx = await buildContext(userId, ids);
  const dtos = new Map(await Promise.all(users.map(async (u) => [u.id, await buildDto(u, ctx)])));

  const unread = await redisService.getAllUnreadCounts(userId).catch(() => ({}));
  const active = [], threads = [], past = [];

  for (const c of chats) {
    const expert = dtos.get(otherId(c));
    if (!expert) continue; // other side is not an expert (e.g. admin)
    const serviceType = SERVICE_NAMES[c.serviceType] || "chat";

    if (c.status === "started") {
      const elapsed = c.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(c.startedAt)) / 1000)) : 0;
      let remaining = null;
      try {
        const v = await conversationService.validateBalanceAndCalculateDuration(userId, expert.id, c.serviceType, { readOnly: true });
        remaining = Math.max(0, v.affordableSeconds);
      } catch (err) { /* leave null */ }
      active.push({ id: c.id, serviceType, expert, startedAt: c.startedAt, elapsedSeconds: elapsed, remainingSeconds: remaining });
    } else if (c.status === "ended" && c.durationSeconds > 0 && past.length < 50) {
      past.push({ id: c.id, serviceType, expert, durationMinutes: Math.max(1, Math.round(c.durationSeconds / 60)), endedAt: c.endedAt });
    }

    const last = await Message.findOne({ where: { chatId: c.id, isDeleted: false }, order: [["createdAt", "DESC"]], attributes: ["content", "createdAt"] });
    if (last && !threads.some((t) => t.expert.id === expert.id)) {
      threads.push({ chatId: c.id, expert, lastMessage: last.content, lastMessageAt: last.createdAt, unreadCount: unread[c.id] || 0 });
    }
  }
  past.sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));
  threads.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
  return { active, threads, past };
}

async function getWallet(userId) {
  return { balance: await walletService.getWalletBalance(userId) };
}

module.exports = { listExperts, getExpert, getQuote, getSessions, getWallet };
