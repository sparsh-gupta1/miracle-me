const { QueryTypes } = require("sequelize");
const {
    sequelize,
    User,
    Transaction,
    CommunicationCharge,
    DailyEarnings,
    CallRequest,
    ResponseWindow,
    WithdrawalRequest,
    Wallet,
} = require("../models");

// Buckets and "day" boundaries are computed in IST so charts match what admins expect.
const TIMEZONE = "Asia/Kolkata";
const PRACTITIONER_ROLES = ["listener", "astrologer"];

// Resolve real table/column names from the models, since tables mix camelCase and snake_case.
const table = (Model) => `"${Model.getTableName()}"`;
const col = (Model, attr) => {
    const definition = Model.rawAttributes[attr];
    if (!definition) throw new Error(`Unknown attribute ${Model.name}.${attr}`);
    return `"${definition.field || attr}"`;
};

const num = (value) => Number(value) || 0;
const money = (value) => Math.round(num(value) * 100) / 100;
const pct = (part, whole) => (whole ? Math.round((part / whole) * 10000) / 100 : 0);

const compare = (value, previousPeriodValue) => ({
    value,
    previousPeriodValue,
    changePct: previousPeriodValue
        ? Math.round(((value - previousPeriodValue) / Math.abs(previousPeriodValue)) * 10000) / 100
        : null,
});

const select = (sql, replacements) =>
    sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

/**
 * Normalise the requested range. Defaults to the last 30 days ending now.
 * The previous period is the window of equal length immediately before `from`.
 */
const resolveRange = ({ from, to } = {}) => {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const length = end.getTime() - start.getTime();
    return {
        from: start,
        to: end,
        previousFrom: new Date(start.getTime() - length),
        previousTo: start,
    };
};

// Sum of what payers were charged, and what earners received, per session.
const listenerEarningExpr = `COALESCE((${col(CommunicationCharge, "metadata")}->>'earningNetAmount')::numeric, ${col(CommunicationCharge, "netEarning")})`;
const sessionSecondsExpr = `COALESCE((${col(CommunicationCharge, "metadata")}->>'totalDurationSeconds')::int, ${col(CommunicationCharge, "durationSeconds")})`;
const freeSecondsExpr = `COALESCE((${col(CommunicationCharge, "metadata")}->>'freeSecondsUsed')::int, 0)`;

// ---------------------------------------------------------------------------
// Per-period building blocks (used for both current and previous periods)
// ---------------------------------------------------------------------------

const getNewUsersByRole = async (from, to) => {
    const rows = await select(
        `SELECT ${col(User, "role")} AS role, COUNT(*)::int AS count
         FROM ${table(User)}
         WHERE ${col(User, "createdAt")} >= :from AND ${col(User, "createdAt")} < :to
           AND ${col(User, "role")} <> 'admin'
         GROUP BY 1`,
        { from, to }
    );
    const result = { user: 0, listener: 0, astrologer: 0 };
    rows.forEach((row) => { result[row.role] = row.count; });
    result.total = result.user + result.listener + result.astrologer;
    return result;
};

const getActiveUsers = async (from, to) => {
    const [row] = await select(
        `SELECT COUNT(*)::int AS count
         FROM ${table(User)}
         WHERE ${col(User, "lastLogin")} >= :from AND ${col(User, "lastLogin")} < :to
           AND ${col(User, "role")} <> 'admin'
           AND ${col(User, "deletedAt")} IS NULL`,
        { from, to }
    );
    return row.count;
};

const getRechargeStats = async (from, to) => {
    const [row] = await select(
        `SELECT
            COALESCE(SUM(${col(Transaction, "amount")}) FILTER (WHERE ${col(Transaction, "status")} = 'completed'), 0) AS revenue,
            COUNT(*) FILTER (WHERE ${col(Transaction, "status")} = 'completed')::int AS completed,
            COUNT(*) FILTER (WHERE ${col(Transaction, "status")} = 'failed')::int AS failed,
            COUNT(*)::int AS attempts,
            COUNT(DISTINCT ${col(Transaction, "userId")}) FILTER (WHERE ${col(Transaction, "status")} = 'completed')::int AS paying_users
         FROM ${table(Transaction)}
         WHERE ${col(Transaction, "createdAt")} >= :from AND ${col(Transaction, "createdAt")} < :to`,
        { from, to }
    );
    const revenue = money(row.revenue);
    return {
        revenue,
        completed: row.completed,
        failed: row.failed,
        attempts: row.attempts,
        payingUsers: row.paying_users,
        arppu: row.paying_users ? money(revenue / row.paying_users) : 0,
        successRate: pct(row.completed, row.attempts),
    };
};

const getConsumptionStats = async (from, to) => {
    const [row] = await select(
        `SELECT
            COUNT(*)::int AS sessions,
            COALESCE(SUM(${col(CommunicationCharge, "grossAmount")}), 0) AS gross_spend,
            COALESCE(SUM(${col(CommunicationCharge, "commissionAmount")}), 0) AS commission,
            COALESCE(SUM(${listenerEarningExpr}), 0) AS listener_earnings,
            COALESCE(SUM(${sessionSecondsExpr}), 0)::bigint AS total_seconds,
            COALESCE(SUM(${freeSecondsExpr}), 0)::bigint AS free_seconds
         FROM ${table(CommunicationCharge)}
         WHERE ${col(CommunicationCharge, "chargedAt")} >= :from AND ${col(CommunicationCharge, "chargedAt")} < :to`,
        { from, to }
    );
    const grossSpend = money(row.gross_spend);
    const listenerEarnings = money(row.listener_earnings);
    return {
        sessions: row.sessions,
        grossSpend,
        commission: money(row.commission),
        listenerEarnings,
        // What the platform actually keeps after paying earners (negative when free minutes are subsidised).
        platformNet: money(grossSpend - listenerEarnings),
        talkMinutes: Math.round(num(row.total_seconds) / 60),
        freeMinutesUsed: Math.round(num(row.free_seconds) / 60),
    };
};

const getPenaltyStats = async (from, to) => {
    const [row] = await select(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(${col(ResponseWindow, "penaltyAmount")}), 0) AS amount
         FROM ${table(ResponseWindow)}
         WHERE ${col(ResponseWindow, "penaltyApplied")} = true
           AND ${col(ResponseWindow, "penaltyAt")} >= :from AND ${col(ResponseWindow, "penaltyAt")} < :to`,
        { from, to }
    );
    return { count: row.count, amount: money(row.amount) };
};

const getApprovedWithdrawals = async (from, to) => {
    const [row] = await select(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(${col(WithdrawalRequest, "amount")}), 0) AS amount
         FROM ${table(WithdrawalRequest)}
         WHERE ${col(WithdrawalRequest, "status")} = 'approved'
           AND ${col(WithdrawalRequest, "processedAt")} >= :from AND ${col(WithdrawalRequest, "processedAt")} < :to`,
        { from, to }
    );
    return { count: row.count, amount: money(row.amount) };
};

// ---------------------------------------------------------------------------
// Point-in-time snapshots (not range based)
// ---------------------------------------------------------------------------

const getUserTotals = async () => {
    const rows = await select(
        `SELECT ${col(User, "role")} AS role,
                COUNT(*) FILTER (WHERE ${col(User, "deletedAt")} IS NULL)::int AS active,
                COUNT(*) FILTER (WHERE ${col(User, "deletedAt")} IS NOT NULL)::int AS deleted
         FROM ${table(User)}
         WHERE ${col(User, "role")} <> 'admin'
         GROUP BY 1`
    );
    const result = { user: 0, listener: 0, astrologer: 0, deleted: 0 };
    rows.forEach((row) => {
        result[row.role] = row.active;
        result.deleted += row.deleted;
    });
    result.total = result.user + result.listener + result.astrologer;
    return result;
};

const getLivePractitioners = async () => {
    const online = `${col(User, "isOnline")} = true AND ${col(User, "manualOffline")} = false`;
    const busy = `(${col(User, "isBusy")} = true OR ${col(User, "isManualBusy")} = true)`;
    const rows = await select(
        `SELECT ${col(User, "role")} AS role,
                COUNT(*) FILTER (WHERE ${online})::int AS online,
                COUNT(*) FILTER (WHERE ${online} AND ${busy})::int AS busy
         FROM ${table(User)}
         WHERE ${col(User, "role")} IN (:roles)
           AND ${col(User, "isActive")} = true
           AND ${col(User, "deletedAt")} IS NULL
         GROUP BY 1`,
        { roles: PRACTITIONER_ROLES }
    );
    const result = {};
    PRACTITIONER_ROLES.forEach((role) => {
        const row = rows.find((r) => r.role === role) || { online: 0, busy: 0 };
        result[role] = { online: row.online, busy: row.busy, available: row.online - row.busy };
    });
    return result;
};

const getPendingWithdrawals = async () => {
    const [row] = await select(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(${col(WithdrawalRequest, "amount")}), 0) AS amount
         FROM ${table(WithdrawalRequest)}
         WHERE ${col(WithdrawalRequest, "status")} = 'pending'`
    );
    return { count: row.count, amount: money(row.amount) };
};

const getWalletLiability = async () => {
    const rows = await select(
        `SELECT ${col(Wallet, "type")} AS type, COALESCE(SUM(${col(Wallet, "balance")}), 0) AS balance
         FROM ${table(Wallet)}
         WHERE ${col(Wallet, "isActive")} = true
         GROUP BY 1`
    );
    const byType = Object.fromEntries(rows.map((r) => [r.type, money(r.balance)]));
    return {
        // Prepaid money users can still spend.
        userBalance: byType.main || 0,
        // Earnings owed to listeners/astrologers but not yet withdrawn.
        earningBalance: byType.earning || 0,
    };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const getOverview = async (query) => {
    const range = resolveRange(query);
    const { from, to, previousFrom, previousTo } = range;

    const [
        newUsers, prevNewUsers,
        activeUsers, prevActiveUsers,
        recharge, prevRecharge,
        consumption, prevConsumption,
        penalties, prevPenalties,
        userTotals, live, pendingWithdrawals, wallets,
    ] = await Promise.all([
        getNewUsersByRole(from, to), getNewUsersByRole(previousFrom, previousTo),
        getActiveUsers(from, to), getActiveUsers(previousFrom, previousTo),
        getRechargeStats(from, to), getRechargeStats(previousFrom, previousTo),
        getConsumptionStats(from, to), getConsumptionStats(previousFrom, previousTo),
        getPenaltyStats(from, to), getPenaltyStats(previousFrom, previousTo),
        getUserTotals(), getLivePractitioners(), getPendingWithdrawals(), getWalletLiability(),
    ]);

    return {
        range,
        users: {
            newUsers: compare(newUsers.user, prevNewUsers.user),
            newListeners: compare(newUsers.listener, prevNewUsers.listener),
            newAstrologers: compare(newUsers.astrologer, prevNewUsers.astrologer),
            newTotal: compare(newUsers.total, prevNewUsers.total),
            activeUsers: compare(activeUsers, prevActiveUsers),
            totals: userTotals,
            live,
        },
        revenue: {
            rechargeRevenue: compare(recharge.revenue, prevRecharge.revenue),
            rechargeCount: compare(recharge.completed, prevRecharge.completed),
            payingUsers: compare(recharge.payingUsers, prevRecharge.payingUsers),
            arppu: compare(recharge.arppu, prevRecharge.arppu),
            rechargeSuccessRate: compare(recharge.successRate, prevRecharge.successRate),
            grossSpend: compare(consumption.grossSpend, prevConsumption.grossSpend),
            commission: compare(consumption.commission, prevConsumption.commission),
            listenerEarnings: compare(consumption.listenerEarnings, prevConsumption.listenerEarnings),
            platformNet: compare(consumption.platformNet, prevConsumption.platformNet),
            penalties: compare(penalties.amount, prevPenalties.amount),
        },
        activity: {
            sessions: compare(consumption.sessions, prevConsumption.sessions),
            talkMinutes: compare(consumption.talkMinutes, prevConsumption.talkMinutes),
            freeMinutesUsed: compare(consumption.freeMinutesUsed, prevConsumption.freeMinutesUsed),
        },
        withdrawals: { pending: pendingWithdrawals },
        wallets,
    };
};

// Each trend metric: source table, timestamp column, value expression, optional split column and filter.
const TREND_METRICS = {
    new_users: {
        Model: User, dateAttr: "createdAt", value: "COUNT(*)",
        series: col(User, "role"), where: `${col(User, "role")} <> 'admin'`,
    },
    recharge_revenue: {
        Model: Transaction, dateAttr: "createdAt", value: `SUM(${col(Transaction, "amount")})`,
        where: `${col(Transaction, "status")} = 'completed'`,
    },
    gross_spend: {
        Model: CommunicationCharge, dateAttr: "chargedAt", value: `SUM(${col(CommunicationCharge, "grossAmount")})`,
    },
    commission: {
        Model: CommunicationCharge, dateAttr: "chargedAt", value: `SUM(${col(CommunicationCharge, "commissionAmount")})`,
    },
    listener_earnings: {
        Model: CommunicationCharge, dateAttr: "chargedAt", value: `SUM(${listenerEarningExpr})`,
    },
    sessions: {
        Model: CommunicationCharge, dateAttr: "chargedAt", value: "COUNT(*)",
        series: col(CommunicationCharge, "serviceType"),
    },
    talk_minutes: {
        Model: CommunicationCharge, dateAttr: "chargedAt", value: `ROUND(SUM(${sessionSecondsExpr}) / 60.0)`,
        series: col(CommunicationCharge, "serviceType"),
    },
};

const getTrend = async ({ metric, interval = "day", ...rest }) => {
    const definition = TREND_METRICS[metric];
    if (!definition) {
        const err = new Error(`Unknown metric "${metric}"`);
        err.name = "ValidationError";
        throw err;
    }
    if (!["day", "week", "month"].includes(interval)) {
        const err = new Error(`Unknown interval "${interval}"`);
        err.name = "ValidationError";
        throw err;
    }

    const { from, to } = resolveRange(rest);
    const { Model, dateAttr, value, series, where } = definition;
    const dateCol = col(Model, dateAttr);
    const bucketExpr = `date_trunc(:interval, ${dateCol} AT TIME ZONE :tz)`;
    const replacements = { from, to, interval, tz: TIMEZONE };

    const [buckets, rows] = await Promise.all([
        select(
            `SELECT to_char(b, 'YYYY-MM-DD') AS bucket
             FROM generate_series(
                date_trunc(:interval, CAST(:from AS timestamptz) AT TIME ZONE :tz),
                date_trunc(:interval, (CAST(:to AS timestamptz) - INTERVAL '1 millisecond') AT TIME ZONE :tz),
                CAST('1 ' || :interval AS interval)
             ) AS b`,
            replacements
        ),
        select(
            `SELECT to_char(${bucketExpr}, 'YYYY-MM-DD') AS bucket,
                    ${series ? `${series}::text` : "'total'"} AS series,
                    COALESCE(${value}, 0) AS value
             FROM ${table(Model)}
             WHERE ${dateCol} >= :from AND ${dateCol} < :to
               ${where ? `AND ${where}` : ""}
               ${Model === User ? `AND ${col(User, "deletedAt")} IS NULL` : ""}
             GROUP BY 1, 2`,
            replacements
        ),
    ]);

    const seriesNames = [...new Set(rows.map((r) => r.series || "unknown"))];
    if (!seriesNames.length) seriesNames.push("total");

    const points = buckets.map(({ bucket }) => {
        const point = { bucket };
        let total = 0;
        seriesNames.forEach((name) => {
            const row = rows.find((r) => r.bucket === bucket && (r.series || "unknown") === name);
            point[name] = row ? money(row.value) : 0;
            total += point[name];
        });
        if (series) point.total = money(total);
        return point;
    });

    return { metric, interval, timezone: TIMEZONE, from, to, series: seriesNames, points };
};

const getSessionBreakdown = async (query) => {
    const { from, to } = resolveRange(query);
    const rows = await select(
        `SELECT ${col(CommunicationCharge, "serviceType")}::text AS service_type,
                COUNT(*)::int AS sessions,
                COUNT(DISTINCT ${col(CommunicationCharge, "userId")})::int AS unique_payers,
                COALESCE(SUM(${sessionSecondsExpr}), 0)::bigint AS total_seconds,
                COALESCE(AVG(${sessionSecondsExpr}), 0) AS avg_seconds,
                COALESCE(SUM(${freeSecondsExpr}), 0)::bigint AS free_seconds,
                COUNT(*) FILTER (WHERE ${freeSecondsExpr} > 0)::int AS sessions_with_free_minutes,
                COALESCE(SUM(${col(CommunicationCharge, "grossAmount")}), 0) AS gross_spend,
                COALESCE(SUM(${col(CommunicationCharge, "commissionAmount")}), 0) AS commission
         FROM ${table(CommunicationCharge)}
         WHERE ${col(CommunicationCharge, "chargedAt")} >= :from AND ${col(CommunicationCharge, "chargedAt")} < :to
         GROUP BY 1
         ORDER BY 2 DESC`,
        { from, to }
    );

    const byServiceType = rows.map((r) => ({
        serviceType: r.service_type || "unknown",
        sessions: r.sessions,
        uniquePayers: r.unique_payers,
        talkMinutes: Math.round(num(r.total_seconds) / 60),
        avgSessionSeconds: Math.round(num(r.avg_seconds)),
        freeMinutesUsed: Math.round(num(r.free_seconds) / 60),
        sessionsWithFreeMinutes: r.sessions_with_free_minutes,
        grossSpend: money(r.gross_spend),
        commission: money(r.commission),
    }));

    const totals = byServiceType.reduce(
        (acc, r) => ({
            sessions: acc.sessions + r.sessions,
            talkMinutes: acc.talkMinutes + r.talkMinutes,
            freeMinutesUsed: acc.freeMinutesUsed + r.freeMinutesUsed,
            grossSpend: money(acc.grossSpend + r.grossSpend),
            commission: money(acc.commission + r.commission),
        }),
        { sessions: 0, talkMinutes: 0, freeMinutesUsed: 0, grossSpend: 0, commission: 0 }
    );

    return { from, to, totals, byServiceType };
};

const getRequestFunnel = async (query) => {
    const { from, to } = resolveRange(query);
    const status = col(CallRequest, "status");
    const rows = await select(
        `SELECT ${col(CallRequest, "requestType")}::text AS request_type,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE ${status} IN ('accepted', 'ended'))::int AS accepted,
                COUNT(*) FILTER (WHERE ${status} = 'rejected')::int AS rejected,
                COUNT(*) FILTER (WHERE ${status} = 'missed')::int AS missed,
                COUNT(*) FILTER (WHERE ${status} = 'cancelled')::int AS cancelled,
                COUNT(*) FILTER (WHERE ${status} = 'pending')::int AS pending,
                AVG(${col(CallRequest, "duractionToAccept")}) FILTER (WHERE ${status} IN ('accepted', 'ended')) AS avg_accept
         FROM ${table(CallRequest)}
         WHERE ${col(CallRequest, "createdAt")} >= :from AND ${col(CallRequest, "createdAt")} < :to
         GROUP BY 1`,
        { from, to }
    );

    const shape = (r) => ({
        total: r.total,
        accepted: r.accepted,
        rejected: r.rejected,
        missed: r.missed,
        cancelled: r.cancelled,
        pending: r.pending,
        acceptanceRate: pct(r.accepted, r.total),
        missRate: pct(r.missed, r.total),
        avgTimeToAccept: r.avg_accept === null ? null : Math.round(num(r.avg_accept)),
    });

    const sum = rows.reduce(
        (acc, r) => {
            ["total", "accepted", "rejected", "missed", "cancelled", "pending"].forEach((k) => { acc[k] += r[k]; });
            if (r.avg_accept !== null) {
                acc.acceptWeighted += num(r.avg_accept) * r.accepted;
                acc.acceptCount += r.accepted;
            }
            return acc;
        },
        { total: 0, accepted: 0, rejected: 0, missed: 0, cancelled: 0, pending: 0, acceptWeighted: 0, acceptCount: 0 }
    );

    return {
        from,
        to,
        totals: shape({ ...sum, avg_accept: sum.acceptCount ? sum.acceptWeighted / sum.acceptCount : null }),
        byRequestType: Object.fromEntries(rows.map((r) => [r.request_type, shape(r)])),
    };
};

const LEADERBOARD_SORT = {
    earnings: "total_net",
    minutes: "total_seconds",
    conversations: "conversations",
    rating: "rating",
};

const getTopPractitioners = async ({ sortBy = "earnings", limit = 10, role, ...rest }) => {
    const { from, to } = resolveRange(rest);
    const orderBy = LEADERBOARD_SORT[sortBy] || LEADERBOARD_SORT.earnings;
    const roles = role ? [role] : PRACTITIONER_ROLES;
    const de = (attr) => `de.${col(DailyEarnings, attr)}`;
    const u = (attr) => `u.${col(User, attr)}`;
    const cr = (attr) => `cr.${col(CallRequest, attr)}`;

    const rows = await select(
        `WITH earnings AS (
            SELECT ${de("userId")} AS user_id,
                   SUM(${de("totalNet")}) AS total_net,
                   SUM(${de("totalGross")}) AS total_gross,
                   SUM(${de("totalPenalty")}) AS total_penalty,
                   SUM(${de("totalDuration")})::bigint AS total_seconds,
                   SUM(${de("conversationCount")})::int AS conversations
            FROM ${table(DailyEarnings)} de
            WHERE ${de("date")} >= (CAST(:from AS timestamptz) AT TIME ZONE :tz)::date
              AND ${de("date")} <= ((CAST(:to AS timestamptz) - INTERVAL '1 millisecond') AT TIME ZONE :tz)::date
            GROUP BY 1
         ),
         requests AS (
            SELECT ${cr("receiverId")} AS user_id,
                   COUNT(*)::int AS received,
                   COUNT(*) FILTER (WHERE ${cr("status")} = 'missed')::int AS missed
            FROM ${table(CallRequest)} cr
            WHERE ${cr("createdAt")} >= :from AND ${cr("createdAt")} < :to
            GROUP BY 1
         )
         SELECT ${u("id")} AS id, ${u("name")} AS name, ${u("role")} AS role,
                ${u("profileImage")} AS profile_image, ${u("rating")} AS rating,
                ${u("isOnline")} AS is_online,
                COALESCE(e.total_net, 0) AS total_net,
                COALESCE(e.total_gross, 0) AS total_gross,
                COALESCE(e.total_penalty, 0) AS total_penalty,
                COALESCE(e.total_seconds, 0) AS total_seconds,
                COALESCE(e.conversations, 0) AS conversations,
                COALESCE(r.received, 0) AS requests_received,
                COALESCE(r.missed, 0) AS requests_missed
         FROM ${table(User)} u
         LEFT JOIN earnings e ON e.user_id = ${u("id")}
         LEFT JOIN requests r ON r.user_id = ${u("id")}
         WHERE ${u("role")} IN (:roles) AND ${u("deletedAt")} IS NULL
           AND (e.user_id IS NOT NULL OR r.user_id IS NOT NULL)
         ORDER BY ${orderBy} DESC NULLS LAST
         LIMIT :limit`,
        { from, to, tz: TIMEZONE, roles, limit: Math.min(Number(limit) || 10, 100) }
    );

    return {
        from,
        to,
        sortBy,
        items: rows.map((r) => ({
            id: r.id,
            name: r.name,
            role: r.role,
            profileImage: r.profile_image,
            rating: r.rating === null ? null : num(r.rating),
            isOnline: r.is_online,
            earnings: money(r.total_net),
            grossEarnings: money(r.total_gross),
            penalties: money(r.total_penalty),
            talkMinutes: Math.round(num(r.total_seconds) / 60),
            conversations: num(r.conversations),
            requestsReceived: num(r.requests_received),
            requestsMissed: num(r.requests_missed),
            missRate: pct(num(r.requests_missed), num(r.requests_received)),
        })),
    };
};

const getFinance = async (query) => {
    const { from, to } = resolveRange(query);
    const [recharge, consumption, penalties, withdrawalsApproved, pendingWithdrawals, wallets] = await Promise.all([
        getRechargeStats(from, to),
        getConsumptionStats(from, to),
        getPenaltyStats(from, to),
        getApprovedWithdrawals(from, to),
        getPendingWithdrawals(),
        getWalletLiability(),
    ]);

    return {
        from,
        to,
        moneyIn: { recharges: recharge.revenue, rechargeCount: recharge.completed, failedRecharges: recharge.failed },
        consumption: {
            grossSpend: consumption.grossSpend,
            commission: consumption.commission,
            listenerEarnings: consumption.listenerEarnings,
            platformNet: consumption.platformNet,
        },
        penalties,
        withdrawals: { approved: withdrawalsApproved, pending: pendingWithdrawals },
        wallets,
    };
};

module.exports = {
    resolveRange,
    getOverview,
    getTrend,
    getSessionBreakdown,
    getRequestFunnel,
    getTopPractitioners,
    getFinance,
    TREND_METRICS,
};
